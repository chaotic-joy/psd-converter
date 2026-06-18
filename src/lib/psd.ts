import { readPsd, type Layer, type Psd } from 'ag-psd';

export interface ParsedPsd {
  /** Flattened composite, ready to draw/export. */
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  /** Number of top-level + nested layers, for display. */
  layerCount: number;
  /** True if any layer carries real vector shape data. */
  hasVectorLayers: boolean;
  /** Visible raster leaf layers that can be exported on their own. */
  layers: LayerInfo[];
}

/** A single exportable layer: its own trimmed raster canvas plus display data. */
export interface LayerInfo {
  /** Stable running index — used for React keys and busy keys. */
  id: string;
  /** Display name including the group path, e.g. "Group 1 / Shadow". */
  name: string;
  /** The layer's own raster canvas, cropped to its content bounds. */
  canvas: HTMLCanvasElement;
  /** canvas.width — the layer's bounds, NOT the document size. */
  width: number;
  /** canvas.height — the layer's bounds, NOT the document size. */
  height: number;
  /** Small dataURL preview for the layer list. */
  thumbnailUrl: string;
  /** Sanitized, deduped name used to build the download filename. */
  fileSafeName: string;
}

/** Recursively walk the layer tree, counting layers and detecting vector shapes. */
function inspectLayers(layers: Layer[] | undefined): {
  count: number;
  hasVector: boolean;
} {
  let count = 0;
  let hasVector = false;
  for (const layer of layers ?? []) {
    count += 1;
    // ag-psd surfaces vector shape data on these fields when present.
    if (layer.vectorMask || layer.vectorFill || layer.vectorStroke) {
      hasVector = true;
    }
    const child = inspectLayers(layer.children);
    count += child.count;
    hasVector = hasVector || child.hasVector;
  }
  return { count, hasVector };
}

/** Make a string safe to use as a filename: strip invalid chars, collapse whitespace. */
function sanitizeName(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*-]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'layer';
}

/** Downscale a layer canvas to a small dataURL thumbnail (longest side <= max). */
function makeThumbnail(source: HTMLCanvasElement, max = 64): string {
  const longest = Math.max(source.width, source.height);
  const scale = longest > max ? max / longest : 1;
  const w = Math.max(1, Math.round(source.width * scale));
  const h = Math.max(1, Math.round(source.height * scale));
  const thumb = document.createElement('canvas');
  thumb.width = w;
  thumb.height = h;
  const ctx = thumb.getContext('2d');
  if (ctx) ctx.drawImage(source, 0, 0, w, h);
  return thumb.toDataURL('image/png');
}

/**
 * Walk the layer tree and collect visible raster leaf layers as exportable
 * entries. Group folders and layers without a canvas (adjustment/empty) are
 * skipped; hidden layers (and hidden groups) are excluded entirely. dataURL
 * thumbnails are generated once here. Filenames are sanitized and deduped.
 */
function collectLayers(layers: Layer[] | undefined): LayerInfo[] {
  const out: LayerInfo[] = [];

  const walk = (items: Layer[] | undefined, parentPath: string[]) => {
    for (const layer of items ?? []) {
      if (layer.hidden) continue;
      const rawName = layer.name?.trim() || 'Layer';

      if (layer.children) {
        walk(layer.children, [...parentPath, rawName]);
        continue;
      }

      const canvas = layer.canvas;
      if (!canvas || !canvas.width || !canvas.height) continue;

      const name = [...parentPath, rawName].join(' / ');
      out.push({
        id: String(out.length),
        name,
        canvas,
        width: canvas.width,
        height: canvas.height,
        thumbnailUrl: makeThumbnail(canvas),
        fileSafeName: sanitizeName([...parentPath, rawName].join('_')),
      });
    }
  };

  walk(layers, []);

  // Dedupe filenames so two layers with the same name don't collide on download.
  const seen = new Map<string, number>();
  for (const info of out) {
    const count = seen.get(info.fileSafeName) ?? 0;
    seen.set(info.fileSafeName, count + 1);
    if (count > 0) info.fileSafeName = `${info.fileSafeName}-${count + 1}`;
  }

  return out;
}

/** Parse a PSD File into a flattened canvas plus metadata. Throws on malformed input. */
export async function parsePsd(file: File): Promise<ParsedPsd> {
  const buffer = await file.arrayBuffer();

  let psd: Psd;
  try {
    psd = readPsd(buffer, {
      skipThumbnail: true,
      useImageData: false,
    });
  } catch (err) {
    throw new Error(
      `This file could not be parsed as a PSD${
        err instanceof Error && err.message ? `: ${err.message}` : '.'
      }`,
    );
  }

  if (!psd.width || !psd.height) {
    throw new Error('The PSD reports no dimensions — it may be corrupt.');
  }

  // ag-psd gives us the flattened composite on psd.canvas. Fall back to a
  // blank canvas of the right size if the composite is missing.
  let canvas = psd.canvas;
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = psd.width;
    canvas.height = psd.height;
  }

  const { count, hasVector } = inspectLayers(psd.children);
  const layers = collectLayers(psd.children);

  return {
    canvas,
    width: psd.width,
    height: psd.height,
    layerCount: count,
    hasVectorLayers: hasVector,
    layers,
  };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error(`Failed to encode image as ${type}.`));
      },
      type,
      quality,
    );
  });
}

/** Flatten onto an opaque white background — required for formats without alpha (JPG). */
function withWhiteBackground(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const flat = document.createElement('canvas');
  flat.width = canvas.width;
  flat.height = canvas.height;
  const ctx = flat.getContext('2d');
  if (!ctx) throw new Error('Could not get a 2D canvas context.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, flat.width, flat.height);
  ctx.drawImage(canvas, 0, 0);
  return flat;
}

export function exportPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return canvasToBlob(canvas, 'image/png');
}

export function exportJpg(canvas: HTMLCanvasElement, quality = 0.92): Promise<Blob> {
  return canvasToBlob(withWhiteBackground(canvas), 'image/jpeg', quality);
}

/**
 * Wrap the rendered raster in an SVG <image>. This is NOT true vector output —
 * it is the same pixels embedded in an SVG container. See the UI caveat.
 */
export async function exportSvg(canvas: HTMLCanvasElement): Promise<Blob> {
  const pngDataUrl = canvas.toDataURL('image/png');
  const { width, height } = canvas;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<image href="${pngDataUrl}" width="${width}" height="${height}" />` +
    `</svg>`;
  return new Blob([svg], { type: 'image/svg+xml' });
}

/** Trigger a browser download for a blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after the click has been processed.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Strip the .psd extension so we can swap in a new one. */
export function baseName(filename: string): string {
  return filename.replace(/\.psd$/i, '') || 'image';
}

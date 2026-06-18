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

  return {
    canvas,
    width: psd.width,
    height: psd.height,
    layerCount: count,
    hasVectorLayers: hasVector,
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

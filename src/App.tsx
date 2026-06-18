import { useCallback, useEffect, useRef, useState } from 'react';
import {
  baseName,
  downloadBlob,
  exportJpg,
  exportPng,
  exportSvg,
  parsePsd,
  type ParsedPsd,
} from './lib/psd';

type Status = 'idle' | 'parsing' | 'ready' | 'error';

interface LoadedFile {
  parsed: ParsedPsd;
  name: string;
  previewUrl: string;
}

export default function App() {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busyFormat, setBusyFormat] = useState<string | null>(null);
  const [jpgQuality, setJpgQuality] = useState(0.92);
  const inputRef = useRef<HTMLInputElement>(null);

  // Revoke the preview object URL when it changes or on unmount.
  useEffect(() => {
    return () => {
      if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl);
    };
  }, [file]);

  const handleFile = useCallback(async (incoming: File) => {
    if (!/\.psd$/i.test(incoming.name)) {
      setStatus('error');
      setError('That doesn’t look like a .psd file. Please choose a Photoshop PSD.');
      setFile(null);
      return;
    }

    setStatus('parsing');
    setError(null);

    try {
      const parsed = await parsePsd(incoming);
      const blob = await exportPng(parsed.canvas);
      const previewUrl = URL.createObjectURL(blob);
      setFile((prev) => {
        if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
        return { parsed, name: incoming.name, previewUrl };
      });
      setStatus('ready');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Something went wrong while reading the PSD.');
      setFile(null);
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const dropped = e.dataTransfer.files?.[0];
      if (dropped) void handleFile(dropped);
    },
    [handleFile],
  );

  const onPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const picked = e.target.files?.[0];
      if (picked) void handleFile(picked);
      // Allow re-selecting the same file.
      e.target.value = '';
    },
    [handleFile],
  );

  const doExport = useCallback(
    async (format: 'png' | 'jpg' | 'svg') => {
      if (!file) return;
      setBusyFormat(format);
      try {
        const { canvas } = file.parsed;
        const stem = baseName(file.name);
        if (format === 'png') {
          downloadBlob(await exportPng(canvas), `${stem}.png`);
        } else if (format === 'jpg') {
          downloadBlob(await exportJpg(canvas, jpgQuality), `${stem}.jpg`);
        } else {
          downloadBlob(await exportSvg(canvas), `${stem}.svg`);
        }
      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Export failed.');
      } finally {
        setBusyFormat(null);
      }
    },
    [file, jpgQuality],
  );

  const reset = useCallback(() => {
    setFile((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
    setStatus('idle');
    setError(null);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            PSD Converter
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Convert Photoshop <code className="rounded bg-slate-200 px-1 py-0.5 text-xs">.psd</code>{' '}
            files to PNG, JPG, or SVG. Everything runs in your browser —{' '}
            <span className="font-medium text-slate-700">no file is ever uploaded to a server.</span>
          </p>
        </header>

        {status !== 'ready' && (
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-16 text-center transition-colors ${
              dragging
                ? 'border-sky-400 bg-sky-50'
                : 'border-slate-300 bg-white hover:border-slate-400'
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".psd,image/vnd.adobe.photoshop"
              onChange={onPick}
              className="hidden"
            />
            <svg
              className="mb-4 h-10 w-10 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9 4.5-4.5m0 0 4.5 4.5m-4.5-4.5v12"
              />
            </svg>
            {status === 'parsing' ? (
              <p className="text-sm font-medium text-slate-600">Reading PSD…</p>
            ) : (
              <>
                <p className="text-sm font-medium text-slate-700">
                  Drop a .psd here, or click to choose
                </p>
                <p className="mt-1 text-xs text-slate-500">Parsed locally, in your browser</p>
              </>
            )}
          </label>
        )}

        {status === 'error' && error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {status === 'ready' && file && (
          <section className="space-y-6">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div
                className="flex items-center justify-center p-4"
                style={{
                  backgroundImage:
                    'linear-gradient(45deg, #f1f5f9 25%, transparent 25%), linear-gradient(-45deg, #f1f5f9 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f1f5f9 75%), linear-gradient(-45deg, transparent 75%, #f1f5f9 75%)',
                  backgroundSize: '20px 20px',
                  backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0',
                }}
              >
                <img
                  src={file.previewUrl}
                  alt={`Preview of ${file.name}`}
                  className="max-h-[420px] w-auto max-w-full object-contain shadow-sm"
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
                <span className="font-medium text-slate-700">{file.name}</span>
                <span>
                  {file.parsed.width} × {file.parsed.height} px · {file.parsed.layerCount} layer
                  {file.parsed.layerCount === 1 ? '' : 's'}
                </span>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <ExportButton
                  label="Download PNG"
                  hint="Lossless, keeps transparency"
                  onClick={() => doExport('png')}
                  busy={busyFormat === 'png'}
                  primary
                />
                <ExportButton
                  label="Download JPG"
                  hint="Smaller, white background"
                  onClick={() => doExport('jpg')}
                  busy={busyFormat === 'jpg'}
                />
                <ExportButton
                  label="Download SVG"
                  hint="Raster wrapped in SVG"
                  onClick={() => doExport('svg')}
                  busy={busyFormat === 'svg'}
                />
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-600">
                <label htmlFor="jpgq" className="font-medium">
                  JPG quality
                </label>
                <input
                  id="jpgq"
                  type="range"
                  min={0.3}
                  max={1}
                  step={0.01}
                  value={jpgQuality}
                  onChange={(e) => setJpgQuality(Number(e.target.value))}
                  className="h-1 flex-1 cursor-pointer accent-sky-500"
                />
                <span className="w-10 tabular-nums text-right">{Math.round(jpgQuality * 100)}%</span>
              </div>

              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
                <span className="font-semibold">About SVG export:</span> this embeds a raster image
                in an SVG wrapper — it won&rsquo;t scale like true vector art unless your PSD uses
                vector shape layers.
                {file.parsed.hasVectorLayers
                  ? ' This file does contain vector shape layers, but export still uses the flattened raster composite.'
                  : ' This file has no vector shape layers, so the SVG is purely a raster image.'}
              </p>
            </div>

            <div className="flex justify-center pt-2">
              <button
                onClick={reset}
                className="text-sm font-medium text-slate-500 underline-offset-4 hover:text-slate-700 hover:underline"
              >
                Convert another file
              </button>
            </div>
          </section>
        )}

        <footer className="mt-12 border-t border-slate-200 pt-6 text-xs text-slate-400">
          <p>
            CMYK documents are converted to RGB on read, and text layers rely on the embedded
            composite (they are not re-rendered). Colors may differ slightly from Photoshop.
          </p>
        </footer>
      </div>
    </div>
  );
}

function ExportButton({
  label,
  hint,
  onClick,
  busy,
  primary,
}: {
  label: string;
  hint: string;
  onClick: () => void;
  busy: boolean;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`flex flex-col items-start rounded-lg border px-4 py-3 text-left transition-colors disabled:opacity-60 ${
        primary
          ? 'border-sky-600 bg-sky-600 text-white hover:bg-sky-700'
          : 'border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50'
      }`}
    >
      <span className="text-sm font-semibold">{busy ? 'Working…' : label}</span>
      <span className={`mt-0.5 text-xs ${primary ? 'text-sky-100' : 'text-slate-500'}`}>
        {hint}
      </span>
    </button>
  );
}

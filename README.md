# PSD Converter

A static, **client-side-only** web app: upload a `.psd` file, preview it, and export
it as **PNG**, **JPG**, or **SVG**. All conversion happens in the browser via
[`ag-psd`](https://github.com/Agamnentzar/ag-psd) — nothing is uploaded to any server.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
```

## Build & deploy

```bash
npm run build    # type-checks, then outputs a static dist/
npm run preview  # serve the production build locally
```

`dist/` is a fully static folder. Deploy it to Netlify, Vercel, GitHub Pages, or any
static host — **no environment variables and no backend required**.

## How it works

1. `ag-psd`'s `readPsd()` parses the file buffer and returns the flattened composite
   canvas (`psd.canvas`).
2. PNG / JPG are produced with `canvas.toBlob()`. JPG is flattened onto a white
   background since JPEG has no alpha channel.
3. SVG export wraps the rendered PNG as a base64 data URI inside an `<svg><image></svg>`.

## A note on "SVG export"

PSD is raster data. Unless a PSD specifically contains vector shape layers, exporting
to SVG does **not** produce true vector art — it embeds the same pixels inside an SVG
container (larger file, no scalability benefit). The UI states this clearly. This tool
does not market raster-in-SVG as "vector conversion."

## Known limitations

- **CMYK** documents are converted to RGB on read; colors may differ slightly.
- **Text layers** are not re-rendered; the app relies on the embedded composite image.
- No server, no auth, no database — by design.

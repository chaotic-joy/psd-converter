# PSD to PNG/JPG/SVG Converter — Build Spec

## What to build

A static web app: upload a `.psd` file, preview it, export as PNG, JPG, or SVG. All conversion happens client-side in the browser. No backend, no file upload to any server.

## Stack

- Vite + React + TypeScript
- `ag-psd` (npm) for PSD parsing — actively maintained, renders to canvas
- Tailwind for styling (keep it minimal, this is a utility tool not a product)

## Why client-side only

PSD files can be large and contain sensitive design work. Parsing in-browser via `ag-psd` + Canvas/OffscreenCanvas means nothing leaves the user's machine. This also means the "server" is just static file hosting — deploys directly to Netlify or Vercel with zero backend config.

## Core flow

1. User drags/drops or selects a `.psd` file
2. `ag-psd`'s `readPsd()` parses the buffer, returns a `psd.canvas` (flattened composite)
3. Render that canvas to an `<img>` preview
4. Export buttons: PNG and JPG call `canvas.toBlob()` directly
5. SVG export wraps the rendered PNG as a base64 data URI inside an `<svg><image></svg>` element — see caveat below

## Critical caveat — flag this in the UI, don't hide it

PSD is raster data. A typical PSD has no real vector paths unless it specifically contains vector shape layers or smart objects. "Export to SVG" on a flattened raster PSD is NOT real vector output — it's a PNG embedded inside an SVG wrapper, same pixel count, larger file size, no scalability benefit.

The UI must say so. Suggested copy directly under the SVG export button:
> "This embeds a raster image in an SVG wrapper — it won't scale like true vector art unless your PSD uses vector shape layers."

Do not market this as "vector conversion." That's the kind of overclaim that erodes trust in the tool.

## Nice-to-haves (skip for v1, mention only if time allows)

- Per-layer export (ag-psd exposes `psd.children` with each layer's own canvas — could let user export individual layers, not just the flattened composite)
- Drag-and-drop multi-file batch conversion
- Quality slider for JPG export

## Out of scope for v1

- CMYK color mode (ag-psd converts to RGB on read, document this limitation if a user's PSD looks off-color)
- Text layer re-rendering (ag-psd doesn't redraw text layer bitmaps; rely on the embedded composite image)
- Any server, any auth, any database

## Acceptance criteria

- [ ] Upload a PSD, see a rendered preview within a few seconds
- [ ] Download a PNG that matches the Photoshop-rendered composite
- [ ] Download a JPG with acceptable quality
- [ ] SVG export works but UI clearly states it's a raster wrapper, not true vector
- [ ] `npm run build` produces a static `dist/` folder deployable to Netlify or Vercel with no environment variables or backend
- [ ] Handles a PSD that fails to parse gracefully (show an error, don't crash the page)

## Reference

- ag-psd: https://github.com/Agamnentzar/ag-psd
- Existing minimal proof of concept (MIT licensed, client-side only): https://kerupani129s.github.io/psd-to-png-or-json/

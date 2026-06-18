# Work Log — Per-Layer Export

**Date:** 2026-06-18
**Feature branch:** `claude/start-plan-session-ejdssf` (merged to `main` via PR #1)

## Goal

Add per-layer export to the PSD Converter: let users download individual PSD
layers (including layers nested in groups) as PNG/JPG/SVG, not just the
flattened composite. Listed as a nice-to-have in `handoff.md`.

## Decisions

- **Layer sizing:** export each layer at its trimmed content bounds (ag-psd's
  native `layer.canvas`) — smaller files, ideal for asset extraction. Does not
  preserve position within the document.
- **Hidden layers:** excluded entirely (skip `layer.hidden === true`).
- **Layers shown:** visible raster leaf layers only — group folders and
  canvas-less nodes (adjustment/empty layers) are not listed.

## Changes

### `src/lib/psd.ts`
- Added `LayerInfo` interface; `ParsedPsd` now carries `layers: LayerInfo[]`.
- `collectLayers()` — recursively walks the layer tree into a flat list with
  group-path display names (e.g. `Group 1 / Shadow`), skipping hidden layers,
  groups, and canvas-less layers.
- `makeThumbnail()` — downscales each layer canvas to a ≤64px dataURL preview
  (GC'd with the `LayerInfo`, no object-URL bookkeeping).
- `sanitizeName()` — filesystem-safe layer names; filenames deduped with
  `-2`/`-3` suffixes on collisions.
- `parsePsd()` now calls `collectLayers(psd.children)`. The generic
  `exportPng`/`exportJpg`/`exportSvg` + `downloadBlob` were reused unchanged by
  passing `layer.canvas`.

### `src/App.tsx`
- Generalized `busyFormat` → `busyKey` so composite and per-layer exports share
  one single-export-at-a-time state (layer keys: `layer:${id}:${format}`).
  Export logic factored into a shared `exportCanvas` helper.
- New "Export individual layers" panel: one row per layer (checkered thumbnail,
  name, dimensions, small PNG/JPG/SVG buttons sharing the JPG quality slider),
  with a fallback message for flattened PSDs.
- Added the `LayerExportButton` subcomponent.

## Verification

- `npm run build` (`tsc --noEmit && vite build`) passed — types and production
  bundle both clean.
- Manual browser testing against a real multi-layer PSD was not run in the
  headless environment; recommended before relying on it in production.

## Status

- Implemented, committed (`c3676b1`), and merged into `main` via PR #1.
- A redundant `export-layers-added` branch was also pushed (the feature was
  already in `main`, so no second PR was possible).

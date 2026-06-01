# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

**Tileset Studio** — a React + Vite web app to author 47+1 autotile tilesets (pixel art, 8×8 or 16×16) and design/test levels with them. Two main views:

- **Tileset** — create the 48-tile sheet three ways: draw a base tile, generate procedurally from a biome palette, or generate a base tile with the OpenAI Images API. Preview all 48 tiles and export an 8×6 PNG.
- **Level Designer** — paint or procedurally generate a level grid that is **autotiled live** with the active tileset. This is the "test bench" for a tileset.

## Commands

```bash
npm install        # install deps
npm run dev        # dev server (Vite) — required for the OpenAI proxy + .env.local
npm run build      # production build to dist/
npm run preview    # preview the production build
```

There is no test suite or linter configured. Verify changes by running `npm run dev` and exercising the UI (Playwright is a devDependency and is used for manual smoke tests; see git history of how it was driven).

## The 48-tile system (the core abstraction)

Everything keys off an **8-bit neighbor bitmask** with a diagonal-pruning rule: a diagonal bit only counts when **both** of its adjacent cardinal neighbors are present. This collapses 256 raw values to exactly **47 valid configurations + 1 empty slot = 48**, laid out as an **8×6** sheet.

- [src/constants/bitmaskTable.js](src/constants/bitmaskTable.js) is the single source of truth. It builds `BITMASK_TO_INDEX`, `INDEX_TO_BITMASK`, and `INDEX_TO_CATEGORY` at module load and asserts exactly 47 valid masks. `BITS` defines the bit for each direction (TL/T/TR/L/R/BL/B/BR).
- **Sheet index 0 is the empty tile**; indices 1..47 are the autotile configs (in ascending bitmask order). A tile array is always `ImageData[48]`.
- Any code that maps neighbors → tile must use the same pruning rule, or masks won't match the table. See [src/core/autotile.js](src/core/autotile.js) `getTileIndex`.

## Architecture

State lives in four hooks; `App.jsx` holds only the cross-cutting UI state (`activeView`, `tileSize`, `mode`, `localBiome`) and wires panels together. No Context, no external state lib — the tree is shallow, props are passed directly.

**Core (pure logic, no React):** [src/core/](src/core/)
- `tileGenerator.js` — draw mode: clones the base `ImageData` and darkens edges / corners / adds inner-corner highlights per bitmask → `ImageData[48]`.
- `proceduralGen.js` — procedural mode: paints each tile from a biome palette (fill + Bayer dither/patterns + border strips + inner-corner pixels).
- `autotile.js` — level grid (`Uint8Array`, 1=solid/0=empty) → per-cell sheet index (`computeIndexMap`).
- `levelGenerator.js` — `GENERATORS` map: caves (cellular automata), islands (value noise), platforms, rooms (dungeon), random. Seedable via mulberry32.
- `exportSheet.js` — composites `ImageData[48]` into an 8×6 PNG and triggers download.
- `aiTile.js` — OpenAI Images API call + downscale to a base tile (see below).
- `canvasUtils.js` — shared pixel ops: `floodFill`, `darkenRegion`, dither, `drawLineInto`, `drawRectInto`, `paintBrush`, hex/RGBA helpers.

**Hooks:** [src/hooks/](src/hooks/)
- `useDrawingCanvas.js` — pixel buffer (`Uint8ClampedArray` at native tile resolution), tools (pencil/eraser/fill/line/rect/rectFill/eyedropper), brush size, zoom, undo/redo, shape tools with a live `preview` overlay, `loadPixels` (used by AI). Zoom is CSS-only; pixel data is never scaled.
- `useTilesheet.js` — holds `ImageData[48]`; `generateFromBitmap` / `generateFromBiome`.
- `useLevelMap.js` — level grid state: paint, generate, clear, fill, resize.
- `useBiomeGallery.js` exists but is **not currently wired** — App manages the active biome via `localBiome` directly.

**Components:** [src/components/](src/components/) grouped by area — `Editor/` (PixelCanvas, ToolBar, PaletteRow, ZoomControl, TilePreviewMosaic), `Generator/` (ModeToggle, ProceduralControls, GenerateButton, AITilePanel), `TileSheet/` (TileSheetPreview, TileCell, ExportButton), `BiomeGallery/`, `Level/` (LevelCanvas, LevelControls).

## Conventions

- **Canvas rendering**: native logical resolution on the `<canvas>` (`width=tileSize`), scaled up with CSS + `image-rendering: pixelated`. Grid overlays are a separate absolutely-positioned canvas with `pointer-events: none`. Mouse → cell: divide client offset by the on-screen cell size and floor.
- **Tiles are `ImageData`** throughout; to blit fast, pre-render each tile to a small offscreen `<canvas>` and `drawImage` (see `LevelCanvas`), rather than `putImageData` per cell.
- **Styling**: one global [src/App.css](src/App.css) with CSS custom properties (`--bg`, `--accent`, etc.). Class-based, no CSS modules. Dark theme.
- Code and comments are in English; the app author communicates in Spanish.

## OpenAI AI base-tile generation

[src/core/aiTile.js](src/core/aiTile.js) + [AITilePanel.jsx](src/components/Generator/AITilePanel.jsx) generate a base tile from a text prompt.

- Default model **`gpt-image-1`** (returns `b64_json`, so no canvas CORS tainting). `dall-e-2`/`dall-e-3` also offered but return a `url` (loaded with `crossOrigin`).
- The API **no longer accepts `response_format`** — do not re-add it.
- In dev, requests go through a **Vite proxy** (`/openai` → `api.openai.com`, configured in [vite.config.js](vite.config.js)) to avoid CORS. The client picks `/openai/v1` when `import.meta.env.DEV`.
- The API key resolves as **localStorage > `VITE_OPENAI_API_KEY` (from `.env.local`)**, and is editable in the UI. `.env.local` is git-ignored.

### ⚠️ Secrets
Never commit API keys or hardcode them in source. The key belongs only in `.env.local` (git-ignored) or the in-app field (localStorage). If a key is ever pasted into a non-ignored file or shared, treat it as compromised and tell the user to rotate it at platform.openai.com.

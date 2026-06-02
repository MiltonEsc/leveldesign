# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

**Tileset Studio** — a React + Vite web app to author 47+1 autotile tilesets (pixel art, 8×8 or 16×16) and design/test levels with them. Three main views:

- **Tileset** — create the 48-tile sheet three ways: draw a base tile, generate procedurally from a biome palette, or generate a base tile with the OpenAI Images API. Preview all 48 tiles and export an 8×6 PNG.
- **Level Designer** — paint or procedurally generate a level grid that is **autotiled live** with the active tileset. This is the "test bench" for a tileset. Supports mouse-wheel zoom (cursor-centered), a collapsible side panel, and a "Fit" button.
- **Assets** — author **scenery props** (trees, houses, barrels…) that are multi-cell (1×1 to 4×4) with a **transparent background**. Generate with the OpenAI Images API and/or draw/retouch by hand, save to a persisted gallery, and export each prop (or an atlas) as a transparent PNG. (Phase B — placing props on the level — is planned but not yet built.)

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

State lives in per-area hooks; `App.jsx` holds only the cross-cutting UI state (`activeView` = `'tileset' | 'level' | 'assets'`, `tileSize`, `mode`, `localBiome`, level zoom/sidebar state) and wires panels together. No Context, no external state lib — the tree is shallow, props are passed directly. The `assets` gallery hook is instantiated in `App.jsx` so it can be shared (Assets view now, Level Designer in Phase B).

**Core (pure logic, no React):** [src/core/](src/core/)
- `tileGenerator.js` — draw mode: clones the base `ImageData` and applies borders per bitmask → `ImageData[48]`. Borders are applied in a **single pass** (`applyBorders`) so corner pixels aren't darkened multiple times, and the direction is **brightness-adaptive**: dark base tiles get *lightened* edges (else the border is invisible), light tiles get darkened edges. Avg brightness is computed once for all 47 variants.
- `proceduralGen.js` — procedural mode: paints each tile from a biome palette (fill + Bayer dither/patterns + border strips + inner-corner pixels).
- `autotile.js` — level grid (`Uint8Array`, 1=solid/0=empty) → per-cell sheet index (`computeIndexMap`).
- `levelGenerator.js` — `GENERATORS` map: caves (cellular automata), islands (value noise), platforms, rooms (dungeon), random. Seedable via mulberry32.
- `exportSheet.js` — composites `ImageData[48]` into an 8×6 PNG and triggers download.
- `aiTile.js` — OpenAI Images API call + downscale to a base **terrain tile** (opaque, see below).
- `aiAsset.js` — OpenAI Images API call for **scenery props**: transparent background + non-square downscale (see below). Re-exports `AI_MODELS` from `aiTile.js`.
- `exportAsset.js` — exports a prop as a transparent PNG (`exportAsset`) or all props as a grid atlas (`exportAllAssets`).
- `canvasUtils.js` — shared pixel ops: `floodFill`, `darkenRegion`, dither, `drawLineInto`, `drawRectInto`, `paintBrush`, hex/RGBA helpers. **These already take `width`/`height` separately**, so they work for non-square asset canvases too.

**Hooks:** [src/hooks/](src/hooks/)
- `useDrawingCanvas.js` — square tile pixel buffer (`Uint8ClampedArray` at native tile resolution), tools (pencil/eraser/fill/line/rect/rectFill/eyedropper), brush size, zoom, undo/redo, shape tools with a live `preview` overlay, `loadPixels` (used by AI). Eraser paints gray. Zoom is CSS-only; pixel data is never scaled.
- `useAssetEditor.js` — like `useDrawingCanvas` but for **non-square, transparent** prop canvases: takes `(width, height)`, default buffer is fully transparent (alpha 0), and the **eraser writes alpha 0** (real transparency). Same tools/undo/redo.
- `useTilesheet.js` — holds `ImageData[48]`; `generateFromBitmap` / `generateFromBiome`.
- `useLevelMap.js` — level grid state: paint, generate, clear, fill, resize.
- `useAssets.js` — saved-props gallery: `add/remove/update/rename/select`, **persisted to `localStorage`** (key `tileset_studio_assets`; pixel buffers serialized as base64).
- `useBiomeGallery.js` exists but is **not currently wired** — App manages the active biome via `localBiome` directly.

**Components:** [src/components/](src/components/) grouped by area — `Editor/` (PixelCanvas, ToolBar, PaletteRow, ZoomControl, TilePreviewMosaic), `Generator/` (ModeToggle, ProceduralControls, GenerateButton, AITilePanel), `TileSheet/` (TileSheetPreview, TileCell, ExportButton), `BiomeGallery/`, `Level/` (LevelCanvas, LevelControls, `zoomConfig.js` — shared zoom bounds/helpers), `Assets/` (AssetsView, AssetCanvas, AssetAIPanel, SizeSelector, AssetGallery).

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
- The API key resolves as **localStorage > `VITE_OPENAI_API_KEY` (from `.env.local`)**, and is editable in the UI. `.env.local` is git-ignored. ⚠️ The local file must be named exactly `.env.local` (with the leading dot) or Vite won't load it.

### OpenAI AI scenery props
[src/core/aiAsset.js](src/core/aiAsset.js) + [AssetAIPanel.jsx](src/components/Assets/AssetAIPanel.jsx) generate a **transparent, multi-cell prop** instead of an opaque tile. Shares the same proxy, models, and key resolution as `aiTile.js`.

- **gpt-image-1** is sent `background: 'transparent'` for a real alpha channel. `dall-e-2/3` return opaque images, so a **corner-sampled chroma key** removes the background.
- Downscaling uses **progressive halving** (`stepDownToCanvas`), not one big `drawImage` — a single 1024→tiny resize looks blurry and washes out alpha. After scaling, `cleanAlpha` snaps alpha to 0/255 around `ALPHA_THRESHOLD` (110) so sprites are crisp and solid, not a semi-transparent "ghost". Tune the threshold if edges are too aggressive/soft.
- Target size is non-square: `pxW = cols*tileSize`, `pxH = rows*tileSize` (cols/rows 1..4).

### ⚠️ Secrets
Never commit API keys or hardcode them in source. The key belongs only in `.env.local` (git-ignored) or the in-app field (localStorage). If a key is ever pasted into a non-ignored file or shared, treat it as compromised and tell the user to rotate it at platform.openai.com.

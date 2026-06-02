# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

**Tileset Studio** — a React + Vite web app to author 47+1 autotile tilesets (pixel art, 8×8 / 16×16 / 64×64) and design/test levels with them. Three main views:

- **Tileset** — create the 48-tile sheet three ways: draw a base tile, generate procedurally from a biome palette, or generate a base tile with the OpenAI Images API. Preview all 48 tiles and export an 8×6 PNG.
- **Level Designer** — paint or procedurally generate a level grid that is **autotiled live** with the active tileset. This is the "test bench" for a tileset. Supports mouse-wheel zoom (cursor-centered), a collapsible side panel, and a "Fit" button. A **Terrain/Props tool toggle** switches between painting terrain and **placing saved props** on top (select a prop in the PropPicker, left-click to place, right-click to remove; a ghost previews placement under the cursor).
- **Assets** — author **scenery props** (trees, houses, barrels…) that are multi-cell (1×1 to 4×4) with a **transparent background**. Generate with the OpenAI Images API and/or draw/retouch by hand, save to a persisted gallery, and export each prop (or an atlas) as a transparent PNG. Saved props are placeable in the Level Designer (Props tool).

## Commands

```bash
npm install        # install deps
npm run dev        # dev server (Vite) — required for the OpenAI proxy + reads .env.local
npm run build      # production build to dist/
npm run preview    # preview the production build
```

`.env.local` (git-ignored) must provide `VITE_OPENAI_API_KEY` (AI generation) and `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (persistence). Without the Supabase vars, the gallery hooks load empty and set an `error`. DB schema lives in `supabase/migrations/` (see Persistence).

There is no test suite or linter configured. Verify changes by running `npm run dev` and exercising the UI (Playwright is a devDependency and is used for manual smoke tests; see git history of how it was driven).

## The 48-tile system (the core abstraction)

Everything keys off an **8-bit neighbor bitmask** with a diagonal-pruning rule: a diagonal bit only counts when **both** of its adjacent cardinal neighbors are present. This collapses 256 raw values to exactly **47 valid configurations + 1 empty slot = 48**, laid out as an **8×6** sheet.

- [src/constants/bitmaskTable.js](src/constants/bitmaskTable.js) is the single source of truth. It builds `BITMASK_TO_INDEX`, `INDEX_TO_BITMASK`, and `INDEX_TO_CATEGORY` at module load and asserts exactly 47 valid masks. `BITS` defines the bit for each direction (TL/T/TR/L/R/BL/B/BR).
- **Sheet index 0 is the empty tile**; indices 1..47 are the autotile configs (in ascending bitmask order). A tile array is always `ImageData[48]`.
- Any code that maps neighbors → tile must use the same pruning rule, or masks won't match the table. See [src/core/autotile.js](src/core/autotile.js) `getTileIndex`.

## Architecture

State lives in per-area hooks; `App.jsx` holds only the cross-cutting UI state (`activeView` = `'tileset' | 'level' | 'assets'`, `tileSize`, `mode`, `localBiome`, `levelTool`, level zoom/sidebar state) and wires panels together. No Context, no external state lib — the tree is shallow, props are passed directly. The `assets`/`tilesets`/`levels` gallery hooks are instantiated in `App.jsx` and shared across views — e.g. `assets` feeds both the Assets editor and the Level Designer's prop placement. Loading a saved tileset/level routes through `App.jsx#applyTilesetDefinition`, which regenerates the 48 tiles.

**Core (pure logic, no React):** [src/core/](src/core/)
- `tileGenerator.js` — draw mode: clones the base `ImageData` and applies borders per bitmask → `ImageData[48]`. Borders are applied in a **single pass** (`applyBorders`) so corner pixels aren't darkened multiple times; exposed edges are always **darkened** (corners a bit more than straight edges).
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
- `useAssetEditor.js` — like `useDrawingCanvas` but for **non-square, transparent** prop canvases: takes `(width, height)`, default buffer is fully transparent (alpha 0), and the **eraser writes alpha 0** (real transparency). Same tools/undo/redo, plus `applySolidify` + a `rawRef` source buffer for the Edge-solidity control (see AI props below).
- `useTilesheet.js` — holds `ImageData[48]`; `generateFromBitmap` / `generateFromBiome`.
- `useLevelMap.js` — level grid state: paint, generate, clear, fill, resize. Also owns **`placedProps`** (`{ id, assetId, x, y }[]`, x/y = anchor cell) with `addProp` / `removeProp` / `clearProps`. Hit-testing (which prop covers a cell) is done in `App.jsx` since the grid hook doesn't know asset dimensions.
- `useAssets.js` / `useTilesets.js` / `useLevels.js` — gallery hooks backed by **Supabase** (see Persistence below). Each loads its table on mount (async, with `error` state), and `add/save`/`remove` call `src/lib/db.js` then update local state. Pixel buffers / grids are base64 via `src/lib/serialize.js`. No localStorage.
- `useBiomeGallery.js` exists but is **not currently wired** — App manages the active biome via `localBiome` directly.

**Components:** [src/components/](src/components/) grouped by area — `Editor/` (PixelCanvas, ToolBar, PaletteRow, ZoomControl, TilePreviewMosaic), `Generator/` (ModeToggle, ProceduralControls, GenerateButton, AITilePanel), `TileSheet/` (TileSheetPreview, TileCell, ExportButton), `BiomeGallery/` (the bottom dock: **GalleryDock** — tabbed footer with a Tilesets tab (preset BiomeCards + cloud SavedTilesetCards + the "save current tileset" input) and a Props tab (saved assets, click to select); BiomeCard, BiomeCardPreview, SavedTilesetCard), `Level/` (LevelCanvas — autotiles terrain **and draws placed props on top** with a cursor ghost, LevelControls, PropPicker — pick which saved prop to place, LevelStorage — save/load cloud levels, `zoomConfig.js` — shared zoom bounds/helpers), `Assets/` (AssetsView, AssetCanvas, AssetAIPanel, SizeSelector, AssetGallery).

**Data layer:** [src/lib/](src/lib/) — `supabase.js` (client singleton), `db.js` (async CRUD per table), `serialize.js` (base64 codec). See Persistence below.

## Conventions

- **Canvas rendering**: native logical resolution on the `<canvas>` (`width=tileSize`), scaled up with CSS + `image-rendering: pixelated`. Grid overlays are a separate absolutely-positioned canvas with `pointer-events: none`. Mouse → cell: divide client offset by the on-screen cell size and floor.
- **Tiles are `ImageData`** throughout; to blit fast, pre-render each tile to a small offscreen `<canvas>` and `drawImage` (see `LevelCanvas`), rather than `putImageData` per cell.
- **Tile size is global (8/16/64)** and everything keys off it. Anything that displays tiles must scale to it, not assume 16: the tilesheet preview grid uses `repeat(8, 1fr)` + `aspect-ratio` (fits any size), editor/preview zooms are computed from the tile size (`useDrawingCanvas` default, `ZoomControl` bounds, `TileCell`/`TilePreviewMosaic`/`BiomeCardPreview`), and border width scales as `max(2, round(tileSize/8))` in `tileGenerator`/`proceduralGen` so it stays visible at 64px. When adding tile-displaying UI, derive sizes from `tileSize`.
- **Styling**: one global [src/App.css](src/App.css) with CSS custom properties (`--bg`, `--accent`, etc.). Class-based, no CSS modules. Dark theme.
- Code and comments are in English; the app author communicates in Spanish.

## OpenAI AI base-tile generation

[src/core/aiTile.js](src/core/aiTile.js) + [AITilePanel.jsx](src/components/Generator/AITilePanel.jsx) generate a base tile from a text prompt.

- Models are the **gpt-image family** (`AI_MODELS` in aiTile.js): `gpt-image-1` (default, proven), `gpt-image-1-mini`, `gpt-image-1.5`, `gpt-image-2`. **OpenAI retired `dall-e-2`/`dall-e-3`** — they return "model does not exist"; don't re-add them. All gpt-image models return `b64_json` (no canvas CORS tainting) and take `size`/`quality` — `buildBody` sends one shape for all of them.
- The API **no longer accepts `response_format`** — do not re-add it. (To see what a key can use: `GET /v1/models`.)
- In dev, requests go through a **Vite proxy** (`/openai` → `api.openai.com`, configured in [vite.config.js](vite.config.js)) to avoid CORS. The client picks `/openai/v1` when `import.meta.env.DEV`.
- The API key resolves as **localStorage > `VITE_OPENAI_API_KEY` (from `.env.local`)**, and is editable in the UI. `.env.local` is git-ignored. ⚠️ The local file must be named exactly `.env.local` (with the leading dot) or Vite won't load it.

### OpenAI AI scenery props
[src/core/aiAsset.js](src/core/aiAsset.js) + [AssetAIPanel.jsx](src/components/Assets/AssetAIPanel.jsx) generate a **transparent, multi-cell prop** instead of an opaque tile. Shares the same proxy, models, and key resolution as `aiTile.js`.

- The request first asks for a native transparent background. If the model rejects it (e.g. **gpt-image-2** → "Transparent background is not supported"), `generateAssetWithAI` **auto-retries** with a solid magenta background and chroma-keys it out (`chromaKey` + `deFringeMagenta`, which kills the magenta edge halo left by anti-aliasing). A failed 400 isn't billed, so the retry is effectively free. gpt-image-1 / 1.5 / mini support transparency natively (no retry).
- Downscaling uses **progressive halving** (`stepDownToCanvas`), not one big `drawImage` — a single 1024→tiny resize looks blurry and washes out alpha. After scaling, `posterize` quantizes RGB to `POSTERIZE_LEVELS` (6) bands so the AI's soft gradient shading reads as crisp flat pixel art. The asset prompt (`STYLE_PREFIX_ASSET`) also explicitly demands flat colors / hard edges / no anti-aliasing.
- **Alpha is left CONTINUOUS by the pipeline** (no auto-binarize). Edge cleanup is user-controlled via the **Edge solidity** slider in the Assets view: `useAssetEditor.applySolidify(threshold, commit)` binarizes alpha using `solidifyAlpha` (canvasUtils) — `≥ threshold → 255`, below `→ 0`. It re-derives from a stored **raw** buffer (`rawRef`, set by `loadPixels`, invalidated on manual drawing) so the slider drags both ways; `commit:false` previews, `commit:true` records history. `AssetsView` auto-applies a default solidity (128) right after a generation so the result looks clean immediately.
- Target size is non-square: `pxW = cols*tileSize`, `pxH = rows*tileSize` (cols/rows 1..4).

## Persistence (Supabase)

Assets (props), saved tilesets, and levels persist in **Supabase Postgres** — a **single shared collection, no login** (anon role has full RLS access). There is no localStorage.

- **Client**: `@supabase/supabase-js` via `src/lib/supabase.js` (a browser can't use the raw Postgres connection string — only the REST API). Needs `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` in `.env.local` (anon key is public/safe; RLS is the gate).
- **Schema**: `supabase/migrations/*_init_storage.sql` — `assets` (props, base64 pixels), `tilesets` (a `definition` jsonb that *regenerates* the 48 tiles, not the rendered pixels: `{mode:'procedural',biomeId,colors}` or `{mode:'draw',basePixels}`), `levels` (base64 `grid` + `placed_props` + embedded `tileset` definition). RLS on, open policies. Apply via `psql "<conn string>" -f <file>`, Dashboard SQL editor, or git↔Supabase sync.
- **Data layer**: `src/lib/db.js` (thin async CRUD per table) + `src/lib/serialize.js` (`bytesToBase64`/`base64ToBytes`).
- **Loading a tileset/level** reuses the existing generators: `App.jsx#applyTilesetDefinition` calls `generateFromBitmap` (draw) or `generateFromBiome` (procedural) — definitions are tiny, tiles are regenerated on demand.
- **UI**: the bottom **GalleryDock** (Tilesets tab) saves the current tileset and lists saved ones (`SavedTilesetCard` regenerates each preview); its Props tab lists saved assets. `LevelStorage` (level sidebar) saves/loads levels. The Assets view also has its own `AssetGallery`.

### ⚠️ Secrets
Never commit API keys, the DB password, or hardcode them in source. They belong only in `.env.local` (git-ignored) or the in-app field (localStorage). The Supabase **anon key** is the exception — public by design, safe to ship. If a secret is pasted into a non-ignored file or shared in chat, treat it as compromised: rotate OpenAI keys at platform.openai.com, the DB password in the Supabase dashboard.

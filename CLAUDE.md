# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

**Tileset Studio** — a React + Vite web app to author 47+1 autotile tilesets (pixel art, 8×8 / 16×16 / 64×64) and design/test levels with them. **Two top-level views** (header tabs `Editor` / `Levels`, `activeView`):

- **Editor** — the left workspace switches between **Tileset / Assets** (`editorKind`):
  - *Tileset*: create the 48-tile sheet three ways — draw a base tile, generate procedurally from a biome palette, or generate a base tile with the OpenAI Images API. Preview all 48 tiles and export an 8×6 PNG.
  - *Assets*: author **scenery props** (trees, houses, barrels…), multi-cell (1×1 to 4×4) with a **transparent background**. Generate with the OpenAI Images API and/or draw by hand, save to a gallery, export each prop or an atlas PNG. (Rendered by `AssetsView`.)
- **Levels** — paint or procedurally generate a level grid that is **autotiled live** with the active tileset (the "test bench"). Mouse-wheel zoom (cursor-centered), collapsible side panel, "Fit" button. A **Terrain/Props tool toggle** switches between painting terrain and **placing saved props** on top (select a prop in the PropPicker, left-click to place, right-click to remove; a ghost previews placement).

**UI convention: no emojis** — labels/buttons use plain text. Don't add emoji to the interface.

## Commands

```bash
npm install        # install deps
npm run dev        # dev server (Vite) — required for the OpenAI proxy + reads .env.local
npm run build      # production build to dist/
npm run preview    # preview the production build
```

`.env.local` (git-ignored) provides the AI keys — `VITE_GEMINI_API_KEY` and/or `VITE_OPENAI_API_KEY` (the active model's provider decides which is used) — plus `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (persistence). Keys are **read from env only — there is no API-key field in the UI** (it was removed; ⚠️ `VITE_*` vars are still bundled into the client at build time, so this hides the key from the UI but isn't true secrecy — proxy through a backend for that). Without the Supabase vars, the gallery hooks load empty and set an `error`. DB schema lives in `supabase/migrations/` (see Persistence).

There is no test suite or linter configured. Verify changes by running `npm run dev` and exercising the UI (Playwright is a devDependency and is used for manual smoke tests; see git history of how it was driven).

## The 48-tile system (the core abstraction)

Everything keys off an **8-bit neighbor bitmask** with a diagonal-pruning rule: a diagonal bit only counts when **both** of its adjacent cardinal neighbors are present. This collapses 256 raw values to exactly **47 valid configurations + 1 empty slot = 48**, laid out as an **8×6** sheet.

- [src/constants/bitmaskTable.js](src/constants/bitmaskTable.js) is the single source of truth. It builds `BITMASK_TO_INDEX`, `INDEX_TO_BITMASK`, and `INDEX_TO_CATEGORY` at module load and asserts exactly 47 valid masks. `BITS` defines the bit for each direction (TL/T/TR/L/R/BL/B/BR).
- **Sheet index 0 is the empty tile**; indices 1..47 are the autotile configs (in ascending bitmask order). A tile array is always `ImageData[48]`.
- Any code that maps neighbors → tile must use the same pruning rule, or masks won't match the table. See [src/core/autotile.js](src/core/autotile.js) `getTileIndex`.

## Architecture

State lives in per-area hooks; `App.jsx` holds only the cross-cutting UI state (`activeView` = `'editor' | 'level'`, `editorKind` = `'tileset' | 'prop'`, `tileSize`, `mode`, `localBiome`, `levelTool`, level zoom/sidebar state, `activeLevelMaterial`) and wires panels together. No Context, no external state lib — the tree is shallow, props are passed directly. The `assets`/`tilesets`/`levels` gallery hooks are instantiated in `App.jsx` and shared across views — e.g. `assets` feeds both the Assets editor and the Level Designer's prop placement. Loading a saved tileset/level routes through `App.jsx#applyTilesetDefinition`, which regenerates the 48 tiles.

**Multi-material level painting**: `App.jsx` maintains `activeLevelMaterial` (index into `level.materials`). `levelMaterialTiles` (memo) runs `tilesFromDefinition` for each registered material. `ensureCurrentLevelMaterial(material)` deduplicates and registers materials; it is called automatically via `useEffect` when entering the level view so the current tileset is always available. When the level view is active, `GalleryDock`'s `onSelectBiome` and `onLoadTileset` callbacks call `ensureCurrentLevelMaterial` instead of replacing the editor tileset, allowing multiple materials to coexist. All terrain paint handlers pass `activeLevelMaterial` as the `materialId` to the level hook.

### "Pixel Workbench" design system
The whole UI uses a single locked **pixel** theme (ported from a standalone mockup): hard corners (`--bw: 2px`, small `--r-*`), offset block shadows (`2px 2px 0`), a 4px background grid, bundled fonts ([src/assets/fonts/](src/assets/fonts/): Albert Sans = `--ui`, JetBrains Mono = `--mono`, Silkscreen = `--pixel` for section eyebrows/brand), and a teal accent `#2fd6a6`. There is **no theme switcher** — pixel is the only direction.

- **Reusable UI primitives** live in [src/components/ui/](src/components/ui/): `PixIcon` (+ `icons.js` string-grid icons), `Btn` (variants primary/accentSoft/solid/ghost/outline/danger), `Segmented`, `Section` (collapsible, pixel eyebrow), `ColorRow`. These render with inline styles bound to the CSS tokens — prefer them over hand-rolled controls.
- **Layout** (mockup classes in [src/App.css](src/App.css)): `.topbar` (brand + `Segmented[Editor|Levels]` + `Segmented[8|16|64]`), `.editor-grid` (3 cols `286px 1fr 308px` of `.panel`s), `.library` footer (the GalleryDock), `.stage` center, `.map-scroll`/`.map-canvas` for the manual painter.
- Each view is a **workspace component**: `Editor/EditorWorkspace.jsx` (tileset), `Assets/AssetsView.jsx` (props), `Level/LevelsWorkspace.jsx` (levels). `App.jsx` only holds state/handlers and picks the workspace.

**Core (pure logic, no React):** [src/core/](src/core/)
- `tileGenerator.js` — draw mode: clones the base `ImageData` and applies borders per bitmask → `ImageData[48]`. Borders are applied in a **single pass** (`applyBorders`) so corner pixels aren't darkened multiple times; exposed edges are always **darkened** (corners a bit more than straight edges).
- `proceduralGen.js` — procedural mode. `generateAllBiomeTiles` paints each tile from a biome palette: primary fill + Bayer dither/patterns, then **textured borders** (`paintEdge` — irregular inner boundary + scattered border/shadow/highlight pixels, NOT a flat color bar) + inner-corner highlights. Also `generateTilesFromTextures(centerData, edgeData, tileSize, biomeColors)` — composes all 48 tiles from a **center texture + edge source** (edge = an AI/ImageData texture, e.g. snow, or null → synthesized from the border palette). It composes (never crops an AI sheet) so autotiling is always correct. Used by AI procedural generation (below).
- `tilesetDefinition.js` — `tilesFromDefinition(def, tileSize)` — shared utility that regenerates `ImageData[48]` from a saved tileset definition (`{mode:'draw',basePixels}`, `{mode:'textures',centerPixels,edgePixels,colors}`, or procedural/biome). Previously duplicated in `SavedTilesetCard`; now the single source for any code that needs to hydrate a definition.
- `autotile.js` — level grid (`Uint8Array`, 1=solid/0=empty) → per-cell sheet index (`computeIndexMap`).
- `levelGenerator.js` — `GENERATORS` map: caves (cellular automata), islands (value noise), platforms, rooms (dungeon), random. Seedable via mulberry32.
- `exportSheet.js` — composites `ImageData[48]` into an 8×6 PNG (optional `scale` for 1×/2×/4×) and triggers download.
- `exportLevel.js` — exports a level to **game-engine formats**. `buildLevelModel` resolves every visible layer to a flat tile-index array (-1 = empty) via `computeIndexMap` + manual overrides, dedupes tilesets by `layerTiles` reference and renders each with `composeNativeSheet`. `exportLevelTiled` → native `.tmj` (Tiled JSON: gid 0 = empty, `firstgid + index` otherwise, props as an objectgroup). `exportLevelGodot` / `exportLevelUnity` → a generic `.json` (flat per-layer `data`, tileset refs) plus a ready-to-use importer script (`level_importer.gd` using `TileMapLayer.set_cell`; `LevelImporter.cs` using `Tilemap.SetTile` with Y-flip) — high-level engine APIs, no fragile binary scene files. The tileset PNG(s) download alongside (spaced-out multi-download). Prop *placement* is exported; prop images are not.
- `composeSheet.js` — `composeNativeSheet(tiles, tileSize)` blits `ImageData[48]` into one offscreen 8×6 `<canvas>` so the level editors/minimap/tile-picker can `drawImage` individual tiles fast.
- `aiTile.js` — multi-provider (Gemini / OpenAI) image call + downscale to a base **terrain tile** (opaque, see below). Owns `AI_MODELS`, `providerForModel`, `resolveApiKey`, `generateImage`.
- `aiAsset.js` — same `generateImage` dispatcher for **scenery props**: magenta background + chroma-key + non-square downscale (see below). Re-exports `AI_MODELS` from `aiTile.js`.
- `exportAsset.js` — exports a prop as a transparent PNG (`exportAsset`) or all props as a grid atlas (`exportAllAssets`).
- `canvasUtils.js` — shared pixel ops: `floodFill`, `darkenRegion`, dither, `drawLineInto`, `drawRectInto`, `paintBrush`, hex/RGBA helpers. **These already take `width`/`height` separately**, so they work for non-square asset canvases too.

**Hooks:** [src/hooks/](src/hooks/)
- `useDrawingCanvas.js` — square tile pixel buffer (`Uint8ClampedArray` at native tile resolution), tools (pencil/eraser/fill/line/rect/rectFill/eyedropper), brush size, zoom, undo/redo, shape tools with a live `preview` overlay, `loadPixels` (used by AI), plus `clear()` for the sidebar reset action. Eraser paints gray. Zoom is CSS-only; pixel data is never scaled.
- `useAssetEditor.js` — like `useDrawingCanvas` but for **non-square, transparent** prop canvases: takes `(width, height)`, default buffer is fully transparent (alpha 0), and the **eraser writes alpha 0** (real transparency). Same tools/undo/redo, plus `applySolidify` + a `rawRef` source buffer for the Edge-solidity control (see AI props below).
- `useTilesheet.js` — holds `ImageData[48]`; `generateFromBitmap` / `generateFromBiome`.
- `useLevelMap.js` — level grid state: paint, generate, clear, fill, resize. Also owns **`placedProps`** (`{ id, assetId, x, y }[]`, x/y = anchor cell) with `addProp` / `removeProp` / `clearProps`. Hit-testing (which prop covers a cell) is done in `App.jsx` since the grid hook doesn't know asset dimensions. **Global undo/redo**: a snapshot history (`undo`/`redo`/`canUndo`/`canRedo`) covers all committed level state — every layer's terrain grid + manual tiles, props, layer add/remove/move, and resize. Snapshots store *references* to the already-immutable committed state (no deep clone); a drag is one entry (captured at stroke start, pushed on first real change via `noteStrokeChange`), one-shot ops push before mutating, and `loadState` resets the stacks. `restore` strips each layer's `_dirtyTerrain`/`_dirtyManual` hints so `LevelCanvas` re-diffs whole grids (the hints describe the original edit, not the diff from what's on screen). Wired in `LevelsWorkspace` (Undo/Redo buttons + Ctrl+Z / Ctrl+Y, ignored while typing). Layer rename/visibility are intentionally not tracked. **Multi-material support**: `materials` (`{name, tileSize, definition}[]`) registers tilesets used in the level; `materialIds` (`Int16Array`, same dimensions as `grid`, -1 = no material assigned) tracks which material painted each cell. `ensureMaterial(material)` deduplicates by `tileSize+definition` key and returns the index. All paint operations (`paintArea`, `fillAt`, `fillRect`, `generate`) accept an optional `materialId` that updates `materialIds` in sync with `grid`.
- `useAssets.js` / `useTilesets.js` / `useLevels.js` — gallery hooks backed by **Supabase** (see Persistence below). Each loads its table on mount (async) and exposes **`loading` + `error`**, which the consumers now render (GalleryDock rail banner, AssetGallery, the level Save/load section) so a Supabase failure is visible instead of a silently empty gallery. `remove` is **optimistic with rollback**: it captures the row (via a list ref) before removing and re-inserts it at its original index if the server delete throws, so the UI never claims something is gone while it still exists in the DB. `add/save` call `src/lib/db.js` then update local state. Pixel buffers / grids are base64 via `src/lib/serialize.js`. No localStorage.
- `useBiomeGallery.js` exists but is **not currently wired** — App manages the active biome via `localBiome` directly.

**Components:** [src/components/](src/components/) grouped by area:
- `ui/` — shared pixel-theme primitives (PixIcon + icons, Btn, Segmented, Section, ColorRow).
- `Editor/` — **EditorWorkspace** (the 3-col tileset view: palette `ColorRow`s, mode toggle, center canvas/preview, export), plus the canvas pieces it reuses (PixelCanvas, TilePreviewMosaic). ToolBar/PaletteRow/ZoomControl still exist but are superseded by primitives.
- `Generator/` — AI panels reused by the editor (AITilePanel for draw, AIProceduralPanel for procedural). ModeToggle/ProceduralControls/GenerateButton are legacy/unused.
- `TileSheet/` — TileCell, TileSheetPreview, ExportButton (legacy; the editor now renders the preview via `composeNativeSheet`).
- `BiomeGallery/` — **GalleryDock** = the `.library` footer (Segmented `Tilesets|Props`, All/Biomes/Saved filter chips, search, save name + Save, `lib-card` rail). Palette-stripe thumbnails for tilesets, transparent thumbnails for props. **`SavedTilesetCard`** now imports `tilesFromDefinition` from `src/core/tilesetDefinition.js` (removed the local duplicate).
- `Level/` — **LevelsWorkspace** (Autotile/Manual toggle). **Both** modes render through **LevelCanvas** (autotiles terrain + draws placed props with a cursor ghost) over the same `useLevelMap` state — the Manual toggle just switches the active layer/tools to tile-index painting (`paintManualArea` etc.), it is not a separate component. Plus a primitives-based control panel (with the global Undo/Redo row) + **Minimap**. (`ManualLevelEditor.jsx` is a legacy standalone editor and is **not imported anywhere** — dead code, safe to remove.) `zoomConfig.js` = shared zoom bounds. **Layout is two columns** (`318px control panel | canvas`, the panel collapses to `0`); the old right-hand panel was removed and **Export now lives as a section in the left panel** (PNG + Tiled/Godot/Unity via `exportLevel.js`) so the canvas spans the full freed width. **Multi-material**: `LevelsWorkspace` receives `activeLevelMaterial` + `levelMaterialTiles` (pre-rendered `{tiles, tileSize}[]`) from `App.jsx`; a "Materials" sidebar section (`MaterialMini` thumbnails, active card highlight) lets the user pick the active paint material. Rendering (canvas export, minimap, manual palette, `LevelCanvas`) resolves each cell's sheet via `materialIds`: if the cell has a material index, draw from that tileset's autotile index map; otherwise fall back to the current tileset. `LevelCanvas` props: `materialIds` (`Int16Array`) and `materialTiles` (same shape as `levelMaterialTiles`); it pre-computes `materialTileCanvases` and per-material `materialIndexMaps` via `useMemo`.
- `Assets/` — AssetsView (re-skinned), AssetCanvas, AssetAIPanel, SizeSelector, AssetGallery.

**Data layer:** [src/lib/](src/lib/) — `supabase.js` (client singleton), `db.js` (async CRUD per table), `serialize.js` (base64 codec). See Persistence below.

## Conventions

- **Canvas rendering**: native logical resolution on the `<canvas>` (`width=tileSize`), scaled up with CSS + `image-rendering: pixelated`. Grid overlays are a separate absolutely-positioned canvas with `pointer-events: none`. Mouse → cell: divide client offset by the on-screen cell size and floor.
- **Tiles are `ImageData`** throughout; to blit fast, pre-render each tile to a small offscreen `<canvas>` and `drawImage` (see `LevelCanvas`), rather than `putImageData` per cell.
- **Tile size is global (8/16/64)** and everything keys off it. Anything that displays tiles must scale to it, not assume 16: the tilesheet preview grid uses `repeat(8, 1fr)` + `aspect-ratio` (fits any size), editor/preview zooms are computed from the tile size (`useDrawingCanvas` default, `ZoomControl` bounds, `TileCell`/`TilePreviewMosaic`/`BiomeCardPreview`), and border width scales as `max(2, round(tileSize/8))` in `tileGenerator`/`proceduralGen` so it stays visible at 64px. When adding tile-displaying UI, derive sizes from `tileSize`.
- **Styling**: one global [src/App.css](src/App.css) with CSS custom properties (`--bg`, `--accent`, etc.). Class-based, no CSS modules. Dark theme with a more modern generator-like left sidebar and glassy workspace panels.
- Code and comments are in English; the app author communicates in Spanish.

## AI base-tile generation (Gemini + OpenAI)

[src/core/aiTile.js](src/core/aiTile.js) + [AITilePanel.jsx](src/components/Generator/AITilePanel.jsx) generate a base tile from a text prompt. **Two providers, picked per model** via `providerForModel(modelId)`:

- `AI_MODELS` (aiTile.js) tags each model with a `provider`: **Gemini** (`gemini-2.5-flash-image` default, `gemini-3-pro-image`) and **OpenAI** (`gpt-image-1`, `gpt-image-1-mini`). `generateImage({prompt, model, quality, outputFormat})` resolves the provider, gets the matching key from env, and dispatches.
- **Gemini request** (`buildImageRequestBody`): endpoint **`v1beta`** `:generateContent`, header `x-goog-api-key`. `generationConfig` uses `responseModalities: ['IMAGE']` + **`imageConfig: { aspectRatio }`**. ⚠️ Do **not** use `responseFormat` or the `v1` endpoint — both make the API reject the body with *"Unknown name responseFormat / responseModalities at generation_config"* (the original bug). Image bytes come back as `candidates[].content.parts[].inlineData.data` (base64).
- **OpenAI request** (`requestOpenAIImage`): endpoint `v1/images/generations`, header `Authorization: Bearer`, body `{model, prompt, n, size:'1024x1024', quality}`. Returns `data[0].b64_json`. Don't send `response_format` (retired).
- **Keys come from `.env.local` only** — `resolveApiKey(provider)` reads `VITE_OPENAI_API_KEY` / `VITE_GEMINI_API_KEY`. **There is no key field in the UI** (removed for safety). ⚠️ The file must be named exactly `.env.local`; `VITE_*` is bundled into the client (not secret in a deployed build).
- In dev, requests go through **Vite proxies** ([vite.config.js](vite.config.js)): `/gemini` → `generativelanguage.googleapis.com`, `/openai` → `api.openai.com`. The client picks `/gemini/v1beta` or `/openai/v1` when `import.meta.env.DEV`.
- Gemini's default model gets a same-provider fallback (`FALLBACK_IMAGE_MODEL`); OpenAI models don't fall back.
- `AITilePanel` is a **generator card** with a prompt box, preset chips, a model selector (Gemini + OpenAI options), and a **Generate Tileset** CTA — no key field.

### AI scenery props
[src/core/aiAsset.js](src/core/aiAsset.js) + [AssetAIPanel.jsx](src/components/Assets/AssetAIPanel.jsx) generate a **transparent, multi-cell prop** instead of an opaque tile. Shares the same `generateImage` dispatcher, models, proxies, and env-only key resolution as `aiTile.js`.

- The prop is generated on a solid magenta background and **chroma-keyed out locally** (`chromaKey` + `deFringeMagenta`, which kills the magenta edge halo from anti-aliasing) — works the same across both providers.
- After downscaling, `posterize` quantizes RGB so the AI's soft gradient shading reads as crisp flat pixel art; the asset prompt (`STYLE_BASE`) also demands flat colors / hard edges / no anti-aliasing.
- **Alpha is left CONTINUOUS by the pipeline** (no auto-binarize). Edge cleanup is user-controlled via the **Edge solidity** slider in the Assets view: `useAssetEditor.applySolidify(threshold, commit)` binarizes alpha using `solidifyAlpha` (canvasUtils) — `≥ threshold → 255`, below `→ 0`. It re-derives from a stored **raw** buffer (`rawRef`, set by `loadPixels`, invalidated on manual drawing) so the slider drags both ways; `commit:false` previews, `commit:true` records history. `AssetsView` auto-applies a default solidity (128) right after a generation so the result looks clean immediately.
- Target size is non-square: `pxW = cols*tileSize`, `pxH = rows*tileSize` (cols/rows 1..4).
- `AssetsView` now mirrors the tileset sidebar structure with the same **Tileset / Assets** top switch, card layout, and a primary **Generate Asset** CTA.

### AI procedural tilesets
In procedural mode the sidebar has an `AIProceduralPanel` (separate from the instant palette `Generate procedural`). It asks for a **Center** prompt and an optional **Border** prompt, includes ready-made material presets, calls `generateBaseTileWithAI` once or twice (opaque square textures at tileSize), and hands them to `useTilesheet.generateFromTextures` → `generateTilesFromTextures`, which composes the 48 autotiles (center fill + border material on exposed edges). This yields rich material-on-material tilesets (e.g. cave rock with snow edges) while guaranteeing the tiles autotile, since they're composed by bitmask rather than cropped from an AI image.

## Persistence (Supabase)

Assets (props), saved tilesets, and levels persist in **Supabase Postgres** — a **single shared collection, no login** (anon role has full RLS access). There is no localStorage.

- **Client**: `@supabase/supabase-js` via `src/lib/supabase.js` (a browser can't use the raw Postgres connection string — only the REST API). Needs `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` in `.env.local` (anon key is public/safe; RLS is the gate).
- **Schema**: `supabase/migrations/*_init_storage.sql` — `assets` (props, base64 pixels), `tilesets` (a `definition` jsonb that *regenerates* the 48 tiles, not the rendered pixels: `{mode:'procedural',biomeId,colors}` or `{mode:'draw',basePixels}`), `levels` (base64 `grid` + `material_ids` base64 + `materials` jsonb + `placed_props` + embedded `tileset` definition). The `material_ids` column stores an `Int16Array` encoded as base64 (values are index+1 on write, decoded back with -1 offset on load; -1 = unassigned). `materials` jsonb is an array of `{name, tileSize, definition}` objects. RLS on, open policies. Apply via `psql "<conn string>" -f <file>`, Dashboard SQL editor, or git↔Supabase sync.
- **Data layer**: `src/lib/db.js` (thin async CRUD per table) + `src/lib/serialize.js` (`bytesToBase64`/`base64ToBytes`). `saveLevel` now accepts `materialIdsB64` and `materials`; `listLevels` returns those columns so `handleLoadLevel` can restore multi-material state.
- **Loading a tileset/level** reuses the existing generators: `App.jsx#applyTilesetDefinition` calls `generateFromBitmap` (draw) or `generateFromBiome` (procedural) — definitions are tiny, tiles are regenerated on demand.
- **UI**: the bottom **GalleryDock** (Tilesets tab) saves the current tileset and lists saved ones (`SavedTilesetCard` regenerates each preview); its Props tab lists saved assets. `LevelStorage` (level sidebar) saves/loads levels. The Assets view also has its own `AssetGallery`.

### ⚠️ Secrets
Never commit API keys, the DB password, or hardcode them in source. AI keys belong **only in `.env.local`** (git-ignored) — `VITE_OPENAI_API_KEY` / `VITE_GEMINI_API_KEY`. There is no in-app key field anymore. The Supabase **anon key** is the exception — public by design, safe to ship. Note `VITE_*` vars are embedded in the client bundle, so even env keys ship to the browser in a deployed build; for true secrecy proxy the calls through a backend. If a secret is pasted into a non-ignored file or shared in chat, treat it as compromised: rotate OpenAI keys at platform.openai.com, Gemini keys at aistudio.google.com/apikey, the DB password in the Supabase dashboard.

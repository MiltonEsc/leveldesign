import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { PixelCanvas }        from './components/Editor/PixelCanvas.jsx'
import { ToolBar }            from './components/Editor/ToolBar.jsx'
import { PaletteRow }         from './components/Editor/PaletteRow.jsx'
import { ZoomControl }        from './components/Editor/ZoomControl.jsx'
import { TilePreviewMosaic }  from './components/Editor/TilePreviewMosaic.jsx'
import { ModeToggle }         from './components/Generator/ModeToggle.jsx'
import { ProceduralControls } from './components/Generator/ProceduralControls.jsx'
import { GenerateButton }     from './components/Generator/GenerateButton.jsx'
import { AITilePanel }        from './components/Generator/AITilePanel.jsx'
import { TileSheetPreview }   from './components/TileSheet/TileSheetPreview.jsx'
import { ExportButton }       from './components/TileSheet/ExportButton.jsx'
import { GalleryDock }        from './components/BiomeGallery/GalleryDock.jsx'
import { LevelCanvas }        from './components/Level/LevelCanvas.jsx'
import { LevelControls }      from './components/Level/LevelControls.jsx'
import { PropPicker }         from './components/Level/PropPicker.jsx'
import { LevelStorage }       from './components/Level/LevelStorage.jsx'
import { AssetsView }         from './components/Assets/AssetsView.jsx'
import { useDrawingCanvas }   from './hooks/useDrawingCanvas.js'
import { useTilesheet }       from './hooks/useTilesheet.js'
import { useLevelMap }        from './hooks/useLevelMap.js'
import { useAssets }          from './hooks/useAssets.js'
import { useTilesets }        from './hooks/useTilesets.js'
import { useLevels }          from './hooks/useLevels.js'
import { BIOMES, BIOME_MAP }  from './constants/biomes.js'
import { GENERATORS }         from './core/levelGenerator.js'
import { clampCellPx } from './components/Level/zoomConfig.js'
import { bytesToBase64, base64ToBytes } from './lib/serialize.js'

export default function App() {
  const [activeView, setActiveView] = useState('tileset') // 'tileset' | 'level'
  const [tileSize, setTileSize]     = useState(16)
  const [mode, setMode]             = useState('procedural')

  const drawing   = useDrawingCanvas(tileSize)
  const tilesheet = useTilesheet()
  const level     = useLevelMap(32, 20)
  const assets    = useAssets()
  const tilesets  = useTilesets()
  const levels    = useLevels()

  const [cellPx, setCellPxRaw]        = useState(18)
  const [showLevelGrid, setShowLevelGrid] = useState(true)
  const [levelSidebarCollapsed, setLevelSidebarCollapsed] = useState(false)
  const [levelTool, setLevelTool]     = useState('terrain') // 'terrain' | 'props'
  const levelCanvasAreaRef = useRef(null)

  // Lookup of saved props by id, for placing/drawing on the level
  const assetsById = useMemo(
    () => Object.fromEntries(assets.assets.map(a => [a.id, a])),
    [assets.assets]
  )

  const handlePlaceProp = useCallback((x, y) => {
    if (assets.selectedId == null) return
    level.addProp(assets.selectedId, x, y)
  }, [assets.selectedId, level])

  // Remove the topmost placed prop whose footprint covers cell (x,y)
  const handleRemovePropAt = useCallback((x, y) => {
    for (let i = level.placedProps.length - 1; i >= 0; i--) {
      const p = level.placedProps[i]
      const a = assetsById[p.assetId]
      if (!a) continue
      if (x >= p.x && x < p.x + a.cols && y >= p.y && y < p.y + a.rows) {
        level.removeProp(p.id)
        return
      }
    }
  }, [level, assetsById])

  // Clamp every cellPx update to the shared zoom bounds
  const setCellPx = useCallback((next) => {
    setCellPxRaw(prev => clampCellPx(typeof next === 'function' ? next(prev) : next))
  }, [])

  // Fit the whole map into the visible canvas area
  const handleFitLevel = useCallback(() => {
    const area = levelCanvasAreaRef.current
    if (!area) return
    const pad = 48 // matches .level-canvas-area padding ×2
    const fitW = Math.floor((area.clientWidth  - pad) / level.width)
    const fitH = Math.floor((area.clientHeight - pad) / level.height)
    setCellPx(Math.min(fitW, fitH))
  }, [level.width, level.height, setCellPx])

  const [localBiome, setLocalBiome] = useState(() => ({ ...BIOMES[0], colors: { ...BIOMES[0].colors } }))

  // Auto-generate default tileset on first load
  useEffect(() => {
    tilesheet.generateFromBiome(localBiome, tileSize)
  }, []) // eslint-disable-line

  const handleTileSizeChange = (newSize) => {
    setTileSize(newSize)
    drawing.resetCanvas(newSize)
    tilesheet.generateFromBiome(localBiome, newSize)
  }

  // Keyboard shortcuts (draw view only)
  useEffect(() => {
    const handleKey = (e) => {
      if (activeView !== 'tileset' || mode !== 'draw') return
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); drawing.undo() }
      if (e.ctrlKey && e.key === 'y') { e.preventDefault(); drawing.redo() }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [drawing, activeView, mode])

  const handleGenerate = () => {
    if (mode === 'draw') {
      tilesheet.generateFromBitmap(drawing.getImageData(), tileSize)
    } else {
      tilesheet.generateFromBiome(localBiome, tileSize)
    }
  }

  const handleSelectBiome = useCallback((biome) => {
    const fresh = { ...biome, colors: { ...biome.colors } }
    setLocalBiome(fresh)
    tilesheet.generateFromBiome(fresh, tileSize)
  }, [tileSize, tilesheet])

  const handleColorChange = (key, value) => {
    setLocalBiome(prev => ({ ...prev, colors: { ...prev.colors, [key]: value } }))
  }

  // Builds the definition that regenerates the current tileset's 48 tiles.
  const currentTilesetDefinition = useCallback(() => (
    mode === 'draw'
      ? { mode: 'draw', basePixels: bytesToBase64(drawing.committedPixels) }
      : { mode: 'procedural', biomeId: localBiome.id, colors: localBiome.colors }
  ), [mode, drawing.committedPixels, localBiome])

  // Regenerates the 48 tiles from a saved tileset definition at `size`.
  const applyTilesetDefinition = useCallback((def, size) => {
    if (!def) return
    if (def.mode === 'draw') {
      setMode('draw')
      const bytes = base64ToBytes(def.basePixels)
      const side = Math.round(Math.sqrt(bytes.length / 4))
      tilesheet.generateFromBitmap(new ImageData(new Uint8ClampedArray(bytes), side, side), size)
      return bytes
    }
    setMode('procedural')
    const base = BIOME_MAP[def.biomeId] || BIOMES[0]
    const biome = { ...base, colors: { ...base.colors, ...def.colors } }
    setLocalBiome(biome)
    tilesheet.generateFromBiome(biome, size)
    return null
  }, [tilesheet])

  const handleSaveTileset = useCallback((name) => {
    tilesets.save({ name, tileSize, definition: currentTilesetDefinition() })
  }, [tilesets, tileSize, currentTilesetDefinition])

  const handleLoadTileset = useCallback((row) => {
    const size = row.tile_size
    setTileSize(size)
    drawing.resetCanvas(size)
    const bytes = applyTilesetDefinition(row.definition, size)
    if (bytes) drawing.loadPixels(bytes)
  }, [drawing, applyTilesetDefinition])

  const handleSaveLevel = useCallback((name) => {
    levels.save({
      name,
      width: level.width,
      height: level.height,
      tileSize,
      gridB64: bytesToBase64(level.grid),
      placedProps: level.placedProps,
      tileset: currentTilesetDefinition(),
      seamlessEdges: level.seamlessEdges,
    })
  }, [levels, level, tileSize, currentTilesetDefinition])

  const handleLoadLevel = useCallback((row) => {
    const size = row.tile_size
    setTileSize(size)
    drawing.resetCanvas(size)
    applyTilesetDefinition(row.tileset, size)
    level.loadState({
      width: row.width,
      height: row.height,
      grid: base64ToBytes(row.grid),
      placedProps: row.placed_props,
    })
    level.setSeamlessEdges(!!row.seamless_edges)
  }, [drawing, applyTilesetDefinition, level])

  const handleSurprise = useCallback(() => {
    const keys = Object.keys(GENERATORS)
    const key = keys[Math.floor(Math.random() * keys.length)]
    level.generate(key)
  }, [level])

  // Shared bottom dock (biomes + saved tilesets, and a Props tab), used by both views
  const galleryDock = (
    <GalleryDock
      biomes={BIOMES}
      activeBiomeId={localBiome.id}
      tileSize={tileSize}
      onSelectBiome={handleSelectBiome}
      tilesets={tilesets.tilesets}
      defaultName={mode === 'draw' ? 'Drawn tileset' : localBiome.label}
      onSaveTileset={handleSaveTileset}
      onLoadTileset={handleLoadTileset}
      onRemoveTileset={tilesets.remove}
      assets={assets.assets}
      selectedAssetId={assets.selectedId}
      onSelectAsset={assets.select}
    />
  )

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <h1 className="app-title">🎮 Tileset Studio</h1>

        <div className="view-tabs">
          <button className={`view-tab ${activeView === 'tileset' ? 'active' : ''}`} onClick={() => setActiveView('tileset')}>
            🎨 Tileset
          </button>
          <button className={`view-tab ${activeView === 'level' ? 'active' : ''}`} onClick={() => setActiveView('level')}>
            🗺️ Level Designer
          </button>
          <button className={`view-tab ${activeView === 'assets' ? 'active' : ''}`} onClick={() => setActiveView('assets')}>
            🧩 Assets
          </button>
        </div>

        <div className="header-controls">
          <span className="tile-size-label">Tile size:</span>
          <div className="tile-size-toggle">
            {[8, 16, 64].map(s => (
              <button key={s} className={`tile-size-btn ${tileSize === s ? 'active' : ''}`} onClick={() => handleTileSizeChange(s)}>
                {s}×{s}
              </button>
            ))}
          </div>
          {activeView === 'tileset' && <ModeToggle mode={mode} setMode={setMode} />}
        </div>
      </header>

      {/* ─── TILESET VIEW ─────────────────────────────────────────────── */}
      {activeView === 'tileset' && (
        <>
          <main className="app-main">
            <aside className="sidebar">
              {mode === 'draw' && (
                <ToolBar
                  tool={drawing.tool} setTool={drawing.setTool}
                  brush={drawing.brush} setBrush={drawing.setBrush}
                  onUndo={drawing.undo} onRedo={drawing.redo}
                  canUndo={drawing.canUndo} canRedo={drawing.canRedo}
                />
              )}
              <PaletteRow activeColor={drawing.activeColor} setActiveColor={drawing.setActiveColor} />
              {mode === 'draw' && (
                <ZoomControl zoom={drawing.zoom} setZoom={drawing.setZoom} tileSize={tileSize} />
              )}
              {mode === 'draw' && (
                <AITilePanel tileSize={tileSize} onGenerated={drawing.loadPixels} />
              )}
              {mode === 'procedural' && (
                <ProceduralControls biome={localBiome} onColorChange={handleColorChange} />
              )}
            </aside>

            <section className="canvas-area">
              {mode === 'draw' ? (
                <div className="draw-layout">
                  <div className="canvas-container">
                    <div className="canvas-label">Base Tile ({tileSize}×{tileSize})</div>
                    <PixelCanvas
                      pixels={drawing.pixels}
                      tileSize={tileSize}
                      zoom={drawing.zoom}
                      onStartStroke={drawing.startStroke}
                      onContinueStroke={drawing.continueStroke}
                      onEndStroke={drawing.endStroke}
                    />
                    <div className="canvas-hint">Draw a base tile — all 48 variants are generated from it</div>
                  </div>
                  <TilePreviewMosaic pixels={drawing.committedPixels} tileSize={tileSize} />
                </div>
              ) : (
                <div className="proc-info">
                  <div className="proc-info-title">⚙️ Procedural Mode</div>
                  <p>All 48 tiles are generated automatically from the biome palette.</p>
                  <p>Tune colors on the left, then Generate.</p>
                  <div className="proc-biome-badge">{localBiome.emoji} {localBiome.label}</div>
                </div>
              )}
              <GenerateButton mode={mode} onGenerate={handleGenerate} disabled={false} />
            </section>

            <aside className="preview-panel">
              <TileSheetPreview tiles={tilesheet.tiles} tileSize={tileSize} />
              <ExportButton tiles={tilesheet.tiles} tileSize={tileSize} biomeName={localBiome?.id} />
            </aside>
          </main>

          <footer className="app-footer">
            {galleryDock}
          </footer>
        </>
      )}

      {/* ─── LEVEL VIEW ───────────────────────────────────────────────── */}
      {activeView === 'level' && (
        <>
          <main className={`app-main level-main ${levelSidebarCollapsed ? 'level-main-collapsed' : ''}`}>
            <aside className={`sidebar level-sidebar ${levelSidebarCollapsed ? 'collapsed' : ''}`}>
              {!levelSidebarCollapsed && (
                <>
                  <LevelControls
                    width={level.width} height={level.height}
                    cellPx={cellPx} setCellPx={setCellPx}
                    showGrid={showLevelGrid} setShowGrid={setShowLevelGrid}
                    seamlessEdges={level.seamlessEdges} setSeamlessEdges={level.setSeamlessEdges}
                    onGenerate={(type) => level.generate(type)}
                    onClear={level.clear}
                    onFill={level.fillAll}
                    onResize={level.resize}
                    onRandomizeAll={handleSurprise}
                    onFit={handleFitLevel}
                    levelTool={levelTool} setLevelTool={setLevelTool}
                  />
                  {levelTool === 'props' && (
                    <PropPicker
                      assets={assets.assets}
                      selectedId={assets.selectedId}
                      onSelect={assets.select}
                      placedCount={level.placedProps.length}
                      onClearProps={level.clearProps}
                    />
                  )}
                  <LevelStorage
                    levels={levels.levels}
                    onSave={handleSaveLevel}
                    onLoad={handleLoadLevel}
                    onRemove={levels.remove}
                  />
                </>
              )}
            </aside>

            <section className="level-canvas-area" ref={levelCanvasAreaRef}>
              <button
                className="sidebar-toggle"
                onClick={() => setLevelSidebarCollapsed(c => !c)}
                title={levelSidebarCollapsed ? 'Show panel' : 'Hide panel (more canvas space)'}
              >
                {levelSidebarCollapsed ? '⟩' : '⟨'}
              </button>
              {tilesheet.tiles ? (
                <LevelCanvas
                  grid={level.grid} width={level.width} height={level.height}
                  tiles={tilesheet.tiles} tileSize={tileSize} cellPx={cellPx} setCellPx={setCellPx}
                  seamlessEdges={level.seamlessEdges} showGrid={showLevelGrid}
                  onStartPaint={level.startPaint}
                  onContinuePaint={level.continuePaint}
                  onEndPaint={() => {}}
                  levelTool={levelTool}
                  placedProps={level.placedProps}
                  assetsById={assetsById}
                  selectedAssetId={assets.selectedId}
                  onPlaceProp={handlePlaceProp}
                  onRemovePropAt={handleRemovePropAt}
                />
              ) : (
                <div className="level-empty">Generate a tileset first in the Tileset view.</div>
              )}
            </section>
          </main>

          <footer className="app-footer">
            {galleryDock}
          </footer>
        </>
      )}

      {/* ─── ASSETS VIEW ──────────────────────────────────────────────── */}
      {activeView === 'assets' && (
        <AssetsView tileSize={tileSize} gallery={assets} />
      )}
    </div>
  )
}

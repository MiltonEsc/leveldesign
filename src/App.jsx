import { useState, useEffect, useCallback } from 'react'
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
import { BiomeGallery }       from './components/BiomeGallery/BiomeGallery.jsx'
import { LevelCanvas }        from './components/Level/LevelCanvas.jsx'
import { LevelControls }      from './components/Level/LevelControls.jsx'
import { useDrawingCanvas }   from './hooks/useDrawingCanvas.js'
import { useTilesheet }       from './hooks/useTilesheet.js'
import { useLevelMap }        from './hooks/useLevelMap.js'
import { BIOMES }             from './constants/biomes.js'
import { GENERATORS }         from './core/levelGenerator.js'

export default function App() {
  const [activeView, setActiveView] = useState('tileset') // 'tileset' | 'level'
  const [tileSize, setTileSize]     = useState(16)
  const [mode, setMode]             = useState('procedural')

  const drawing   = useDrawingCanvas(tileSize)
  const tilesheet = useTilesheet()
  const level     = useLevelMap(32, 20)

  const [cellPx, setCellPx]           = useState(18)
  const [showLevelGrid, setShowLevelGrid] = useState(true)

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

  const handleSurprise = useCallback(() => {
    const keys = Object.keys(GENERATORS)
    const key = keys[Math.floor(Math.random() * keys.length)]
    level.generate(key)
  }, [level])

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
        </div>

        <div className="header-controls">
          <span className="tile-size-label">Tile size:</span>
          <div className="tile-size-toggle">
            {[8, 16].map(s => (
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
            <BiomeGallery biomes={BIOMES} activeBiomeId={localBiome.id} tileSize={tileSize} onSelectBiome={handleSelectBiome} />
          </footer>
        </>
      )}

      {/* ─── LEVEL VIEW ───────────────────────────────────────────────── */}
      {activeView === 'level' && (
        <>
          <main className="app-main level-main">
            <aside className="sidebar level-sidebar">
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
              />
            </aside>

            <section className="level-canvas-area">
              {tilesheet.tiles ? (
                <LevelCanvas
                  grid={level.grid} width={level.width} height={level.height}
                  tiles={tilesheet.tiles} tileSize={tileSize} cellPx={cellPx}
                  seamlessEdges={level.seamlessEdges} showGrid={showLevelGrid}
                  onStartPaint={level.startPaint}
                  onContinuePaint={level.continuePaint}
                  onEndPaint={() => {}}
                />
              ) : (
                <div className="level-empty">Generate a tileset first in the Tileset view.</div>
              )}
            </section>
          </main>

          <footer className="app-footer">
            <BiomeGallery biomes={BIOMES} activeBiomeId={localBiome.id} tileSize={tileSize} onSelectBiome={handleSelectBiome} />
          </footer>
        </>
      )}
    </div>
  )
}

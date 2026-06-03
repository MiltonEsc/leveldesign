import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { PixIcon }   from './components/ui/PixIcon.jsx'
import { Segmented } from './components/ui/Segmented.jsx'
import { ICONS }     from './components/ui/icons.js'
import { EditorWorkspace } from './components/Editor/EditorWorkspace.jsx'
import { AssetsView }      from './components/Assets/AssetsView.jsx'
import { LevelsWorkspace } from './components/Level/LevelsWorkspace.jsx'
import { GalleryDock }     from './components/BiomeGallery/GalleryDock.jsx'
import { useDrawingCanvas } from './hooks/useDrawingCanvas.js'
import { useTilesheet }     from './hooks/useTilesheet.js'
import { useLevelMap }      from './hooks/useLevelMap.js'
import { useAssets }        from './hooks/useAssets.js'
import { useTilesets }      from './hooks/useTilesets.js'
import { useLevels }        from './hooks/useLevels.js'
import { BIOMES, BIOME_MAP } from './constants/biomes.js'
import { GENERATORS }       from './core/levelGenerator.js'
import { clampCellPx }      from './components/Level/zoomConfig.js'
import { bytesToBase64, base64ToBytes } from './lib/serialize.js'
import { getTileIndex } from './core/autotile.js'

export default function App() {
  const [activeView, setActiveView] = useState('editor') // 'editor' | 'level'
  const [editorKind, setEditorKind] = useState('tileset') // 'tileset' | 'prop'
  const [tileSize, setTileSize]     = useState(16)
  const [mode, setMode]             = useState('procedural') // 'procedural' | 'draw'
  const [levelMode, setLevelMode]   = useState('autotile')   // 'autotile' | 'manual'
  const [manualSelectedTile, setManualSelectedTile] = useState(1)

  const drawing   = useDrawingCanvas(tileSize)
  const tilesheet = useTilesheet()
  const level     = useLevelMap(32, 20)
  const assets    = useAssets()
  const tilesets  = useTilesets()
  const levels    = useLevels()

  const [cellPx, setCellPxRaw]        = useState(18)
  const [showLevelGrid, setShowLevelGrid] = useState(true)
  const [levelTool, setLevelTool]     = useState('terrain') // 'terrain' | 'props'
  const [terrainTool, setTerrainTool] = useState('brush')
  const [terrainBrushSize, setTerrainBrushSize] = useState(1)
  const levelCanvasAreaRef = useRef(null)

  const assetsById = useMemo(
    () => Object.fromEntries(assets.assets.map(a => [a.id, a])),
    [assets.assets]
  )

  const handlePlaceProp = useCallback((x, y) => {
    if (assets.selectedId == null) return
    level.addProp(assets.selectedId, x, y)
  }, [assets.selectedId, level])

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

  const setCellPx = useCallback((next) => {
    setCellPxRaw(prev => clampCellPx(typeof next === 'function' ? next(prev) : next))
  }, [])

  const handleFitLevel = useCallback(() => {
    const area = levelCanvasAreaRef.current
    if (!area) return
    const pad = 48
    const fitW = Math.floor((area.clientWidth  - pad) / level.width)
    const fitH = Math.floor((area.clientHeight - pad) / level.height)
    setCellPx(Math.min(fitW, fitH))
  }, [level.width, level.height, setCellPx])

  const [localBiome, setLocalBiome] = useState(() => ({ ...BIOMES[0], colors: { ...BIOMES[0].colors } }))
  const [aiTextures, setAiTextures] = useState(null)

  useEffect(() => {
    tilesheet.generateFromBiome(localBiome, tileSize)
  }, []) // eslint-disable-line

  const handleTileSizeChange = (newSize) => {
    setTileSize(newSize)
    drawing.resetCanvas(newSize)
    tilesheet.generateFromBiome(localBiome, newSize)
  }

  // Keyboard shortcuts (tileset draw mode only)
  useEffect(() => {
    const handleKey = (e) => {
      if (activeView !== 'editor' || editorKind !== 'tileset' || mode !== 'draw') return
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); drawing.undo() }
      if (e.ctrlKey && e.key === 'y') { e.preventDefault(); drawing.redo() }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [drawing, activeView, editorKind, mode])

  const handleGenerate = () => {
    if (mode === 'draw') {
      tilesheet.generateFromBitmap(drawing.getImageData(), tileSize)
    } else {
      setAiTextures(null)
      tilesheet.generateFromBiome(localBiome, tileSize)
    }
  }

  const handleSelectBiome = useCallback((biome) => {
    const fresh = { ...biome, colors: { ...biome.colors } }
    setLocalBiome(fresh)
    setAiTextures(null)
    tilesheet.generateFromBiome(fresh, tileSize)
  }, [tileSize, tilesheet])

  const handleColorChange = (key, value) => {
    setLocalBiome(prev => ({ ...prev, colors: { ...prev.colors, [key]: value } }))
  }

  const handleResetBiomeColors = useCallback(() => {
    const base = BIOME_MAP[localBiome.id] || BIOMES[0]
    setLocalBiome(prev => ({ ...prev, colors: { ...base.colors } }))
  }, [localBiome.id])

  const handleShuffleBiomeColors = useCallback(() => {
    const vary = (hex, amount) => {
      const value = hex.replace('#', '')
      const clamp = (n) => Math.max(0, Math.min(255, n))
      const next = [0, 2, 4].map((i) => {
        const channel = parseInt(value.slice(i, i + 2), 16)
        const drift = Math.round((Math.random() * 2 - 1) * amount)
        return clamp(channel + drift).toString(16).padStart(2, '0')
      })
      return `#${next.join('')}`
    }
    setLocalBiome(prev => ({
      ...prev,
      colors: {
        primary: vary(prev.colors.primary, 22),
        secondary: vary(prev.colors.secondary, 20),
        border: vary(prev.colors.border, 18),
        highlight: vary(prev.colors.highlight, 24),
        shadow: vary(prev.colors.shadow, 18),
      },
    }))
  }, [])

  const handleAIProcedural = useCallback((centerPixels, edgePixels) => {
    const center = new Uint8ClampedArray(centerPixels)
    const edge   = edgePixels ? new Uint8ClampedArray(edgePixels) : null
    const centerData = new ImageData(center, tileSize, tileSize)
    const edgeData   = edge ? new ImageData(edge, tileSize, tileSize) : null
    tilesheet.generateFromTextures(centerData, edgeData, tileSize, localBiome.colors)
    setAiTextures({ center, edge })
  }, [tileSize, tilesheet, localBiome])

  const currentTilesetDefinition = useCallback(() => {
    if (mode === 'draw') return { mode: 'draw', basePixels: bytesToBase64(drawing.committedPixels) }
    if (aiTextures) return {
      mode: 'textures',
      centerPixels: bytesToBase64(aiTextures.center),
      edgePixels: aiTextures.edge ? bytesToBase64(aiTextures.edge) : null,
      colors: localBiome.colors,
    }
    return { mode: 'procedural', biomeId: localBiome.id, colors: localBiome.colors }
  }, [mode, drawing.committedPixels, localBiome, aiTextures])

  const applyTilesetDefinition = useCallback((def, size) => {
    if (!def) return
    if (def.mode === 'draw') {
      setMode('draw')
      setAiTextures(null)
      const bytes = base64ToBytes(def.basePixels)
      const side = Math.round(Math.sqrt(bytes.length / 4))
      tilesheet.generateFromBitmap(new ImageData(new Uint8ClampedArray(bytes), side, side), size)
      return bytes
    }
    if (def.mode === 'textures') {
      setMode('procedural')
      const center = new Uint8ClampedArray(base64ToBytes(def.centerPixels))
      const edge   = def.edgePixels ? new Uint8ClampedArray(base64ToBytes(def.edgePixels)) : null
      const centerData = new ImageData(center, size, size)
      const edgeData   = edge ? new ImageData(edge, size, size) : null
      tilesheet.generateFromTextures(centerData, edgeData, size, def.colors || {})
      setAiTextures({ center, edge })
      return null
    }
    setMode('procedural')
    setAiTextures(null)
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
    const manualOut = new Uint8ClampedArray(level.manualTiles.length)
    for (let i = 0; i < level.manualTiles.length; i++) manualOut[i] = level.manualTiles[i] + 1
    levels.save({
      name,
      width: level.width, height: level.height, tileSize,
      gridB64: bytesToBase64(level.grid),
      manualTilesB64: bytesToBase64(manualOut),
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
    const manualTiles = row.manual_tiles
      ? Int16Array.from(base64ToBytes(row.manual_tiles), (v) => v - 1)
      : new Int16Array(row.width * row.height).fill(-1)
    level.loadState({
      width: row.width, height: row.height,
      grid: base64ToBytes(row.grid),
      placedProps: row.placed_props,
      manualTiles,
    })
    level.setSeamlessEdges(!!row.seamless_edges)
  }, [drawing, applyTilesetDefinition, level])

  const handleSurprise = useCallback(() => {
    const keys = Object.keys(GENERATORS)
    const key = keys[Math.floor(Math.random() * keys.length)]
    level.generate(key)
  }, [level])

  const handleTerrainStart = useCallback((x, y, erase, brushSize = 1) => {
    if (levelMode === 'manual') {
      level.paintArea(x, y, erase ? 0 : 1, brushSize)
      level.paintManualArea(x, y, erase ? -1 : manualSelectedTile, brushSize)
      return
    }
    level.paintArea(x, y, erase ? 0 : 1, brushSize)
    level.clearManualArea(x, y, brushSize)
  }, [level, levelMode, manualSelectedTile])

  const handleTerrainContinue = useCallback((x, y, brushSize = 1) => {
    if (levelMode === 'manual') {
      const erase = terrainTool === 'eraser'
      level.paintArea(x, y, erase ? 0 : 1, brushSize)
      level.paintManualArea(x, y, erase ? -1 : manualSelectedTile, brushSize)
      return
    }
    const erase = terrainTool === 'eraser'
    level.paintArea(x, y, erase ? 0 : 1, brushSize)
    level.clearManualArea(x, y, brushSize)
  }, [level, levelMode, terrainTool, manualSelectedTile])

  const handleTerrainFill = useCallback((x, y, erase) => {
    if (levelMode === 'manual') {
      level.fillAt(x, y, erase ? 0 : 1)
      level.fillManualAt(x, y, erase ? -1 : manualSelectedTile)
      return
    }
    level.fillAt(x, y, erase ? 0 : 1)
    level.clearManualFill(x, y)
  }, [level, levelMode, manualSelectedTile])

  const handleTerrainRect = useCallback((a, b, erase) => {
    if (levelMode === 'manual') {
      level.fillRect(a, b, erase ? 0 : 1)
      level.fillManualRect(a, b, erase ? -1 : manualSelectedTile)
      return
    }
    level.fillRect(a, b, erase ? 0 : 1)
    level.clearManualRect(a, b)
  }, [level, levelMode, manualSelectedTile])

  const handleTerrainPick = useCallback((x, y) => {
    if (levelMode === 'manual') {
      const manual = level.getManualTile(x, y)
      if (manual >= 0) {
        setManualSelectedTile(manual)
        return
      }
      const idx = getTileIndex(level.grid, level.width, level.height, x, y, level.seamlessEdges ? 1 : 0)
      if (idx > 0) setManualSelectedTile(idx)
      return
    }
    const value = level.getCell(x, y)
    setTerrainTool(value ? 'brush' : 'eraser')
  }, [level, levelMode])

  const galleryDock = (
    <GalleryDock
      biomes={BIOMES}
      activeBiomeId={localBiome.id}
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
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><PixIcon grid={ICONS.grid} px={3} color="#06150f" /></div>
          <span className="brand-name">Tileset Studio</span>
        </div>

        <Segmented size="sm" value={activeView} onChange={setActiveView}
          options={[{ value: 'editor', label: 'Editor' }, { value: 'level', label: 'Levels' }]} />

        <div className="spacer" />

        <div className="topgroup">
          <span className="group-label">GRID</span>
          <Segmented size="sm" value={tileSize} onChange={handleTileSizeChange}
            options={[{ value: 8, label: '8' }, { value: 16, label: '16' }, { value: 64, label: '64' }]} />
        </div>
      </header>

      {activeView === 'editor' && editorKind === 'tileset' && (
        <>
          <EditorWorkspace
            mode={mode} setMode={setMode} tileSize={tileSize}
            biome={localBiome} onColorChange={handleColorChange}
            onResetColors={handleResetBiomeColors} onShuffleColors={handleShuffleBiomeColors}
            drawing={drawing} tiles={tilesheet.tiles}
            onGenerate={handleGenerate} onAITile={drawing.loadPixels} onAIProcedural={handleAIProcedural}
            biomeId={localBiome.id} savedCount={tilesets.tilesets.length}
            editorKind={editorKind} setEditorKind={setEditorKind}
          />
          {galleryDock}
        </>
      )}

      {activeView === 'editor' && editorKind === 'prop' && (
        <>
          <AssetsView tileSize={tileSize} gallery={assets} editorKind={editorKind} setEditorKind={setEditorKind} />
          {galleryDock}
        </>
      )}

      {activeView === 'level' && (
        <>
          <LevelsWorkspace
            levelMode={levelMode} setLevelMode={setLevelMode}
            level={level} tiles={tilesheet.tiles} tileSize={tileSize}
            cellPx={cellPx} setCellPx={setCellPx}
            showGrid={showLevelGrid} setShowGrid={setShowLevelGrid}
            onFit={handleFitLevel} levelCanvasAreaRef={levelCanvasAreaRef}
            levelTool={levelTool} setLevelTool={setLevelTool}
            terrainTool={terrainTool} setTerrainTool={setTerrainTool}
            terrainBrushSize={terrainBrushSize} setTerrainBrushSize={setTerrainBrushSize}
            manualSelectedTile={manualSelectedTile} setManualSelectedTile={setManualSelectedTile}
            assets={assets.assets} assetsById={assetsById}
            selectedAssetId={assets.selectedId} onSelectAsset={assets.select}
            onPlaceProp={handlePlaceProp} onRemovePropAt={handleRemovePropAt}
            onTerrainStart={handleTerrainStart} onTerrainContinue={handleTerrainContinue}
            onTerrainFill={handleTerrainFill} onTerrainRect={handleTerrainRect} onTerrainPick={handleTerrainPick}
            onSurprise={handleSurprise}
            levels={levels.levels} onSaveLevel={handleSaveLevel} onLoadLevel={handleLoadLevel} onRemoveLevel={levels.remove}
          />
          {galleryDock}
        </>
      )}
    </div>
  )
}

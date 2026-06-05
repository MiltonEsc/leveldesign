/* @refresh reset */
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
import { tilesFromDefinition } from './core/tilesetDefinition.js'

function inferColorsFromTiles(tiles) {
  const counts = new Map()
  const luminance = (r, g, b) => (r * 299 + g * 587 + b * 114) / 1000

  for (const tile of tiles || []) {
    const data = tile?.data
    if (!data) continue
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue
      const key = `${data[i]},${data[i + 1]},${data[i + 2]}`
      counts.set(key, (counts.get(key) || 0) + 1)
    }
  }

  const ranked = [...counts.entries()]
    .map(([key, count]) => {
      const [r, g, b] = key.split(',').map(Number)
      return { hex: `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`, count, lum: luminance(r, g, b) }
    })
    .sort((a, b) => b.count - a.count)

  if (!ranked.length) return null

  const unique = []
  for (const color of ranked) {
    if (!unique.find(c => c.hex === color.hex)) unique.push(color)
    if (unique.length >= 12) break
  }

  const byLum = [...unique].sort((a, b) => a.lum - b.lum)
  const primary = unique[0] || byLum[Math.floor(byLum.length / 2)] || null
  const secondary = unique[1] || primary
  const border = byLum[0] || primary
  const highlight = byLum[byLum.length - 1] || primary
  const shadow = byLum[Math.max(0, byLum.length - 2)] || border

  return {
    primary: primary?.hex || '#4a7c2f',
    secondary: secondary?.hex || primary?.hex || '#3d6626',
    border: border?.hex || '#1e3a0f',
    highlight: highlight?.hex || primary?.hex || '#6db84a',
    shadow: shadow?.hex || border?.hex || '#2a4a1a',
  }
}

export default function App() {
  const [activeView, setActiveView] = useState('editor') // 'editor' | 'level'
  const [editorKind, setEditorKind] = useState('tileset') // 'tileset' | 'prop'
  const [tileSize, setTileSize]     = useState(16)
  const [mode, setMode]             = useState('procedural') // 'procedural' | 'draw'
  const [levelMode, setLevelMode]   = useState('autotile')   // 'autotile' | 'manual'
  const [manualSelectedTile, setManualSelectedTile] = useState(1)
  const [activeEditorSavedTilesetId, setActiveEditorSavedTilesetId] = useState(null)

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
  // Layer tiles: each layer resolves to actual ImageData[48].
  // null tileset = use current editor tileset; otherwise computed from definition (cached by key).
  const layerTilesCache = useRef(new Map())
  const editorLayerTile = useMemo(() => ({ tiles: tilesheet.tiles, tileSize }), [tilesheet.tiles, tileSize])
  const layerTiles = useMemo(() => (
    level.layers.map(layer => {
      if (!layer.tileset) return editorLayerTile
      const key = JSON.stringify({ tileSize: layer.tileset.tileSize, definition: layer.tileset.definition })
      if (!layerTilesCache.current.has(key)) {
        layerTilesCache.current.set(key, {
          tiles: tilesFromDefinition(layer.tileset.definition, layer.tileset.tileSize),
          tileSize: layer.tileset.tileSize,
        })
      }
      return layerTilesCache.current.get(key)
    })
  ), [level.layers, editorLayerTile])
  const activeLayer = level.layers[level.activeLayerIdx] ?? null

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
    } else if (aiTextures?.center) {
      const centerData = new ImageData(new Uint8ClampedArray(aiTextures.center), tileSize, tileSize)
      const edgeData = aiTextures.edge
        ? new ImageData(new Uint8ClampedArray(aiTextures.edge), tileSize, tileSize)
        : null
      tilesheet.generateFromTextures(centerData, edgeData, tileSize, localBiome.colors)
    } else {
      tilesheet.generateFromBiome(localBiome, tileSize)
    }
  }

  const handleSelectBiome = useCallback((biome) => {
    const fresh = { ...biome, colors: { ...biome.colors } }
    setLocalBiome(fresh)
    setAiTextures(null)
    setActiveEditorSavedTilesetId(null)
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
      biomeId: localBiome.id,
      label: localBiome.label,
      colors: localBiome.colors,
    }
    return { mode: 'procedural', biomeId: localBiome.id, label: localBiome.label, colors: localBiome.colors }
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
      if (def.colors) {
        const base = BIOME_MAP[def.biomeId] || localBiome || BIOMES[0]
        setLocalBiome({
          ...base,
          label: def.label || base.label,
          colors: { ...base.colors, ...def.colors },
        })
      }
      setAiTextures({ center, edge })
      return null
    }
    setMode('procedural')
    setAiTextures(null)
    const base = BIOME_MAP[def.biomeId] || localBiome || BIOMES[0]
    const biome = {
      ...base,
      label: def.label || base.label,
      colors: { ...base.colors, ...(def.colors || {}) },
    }
    setLocalBiome(biome)
    tilesheet.generateFromBiome(biome, size)
    return null
  }, [tilesheet, localBiome])

  const handleSaveTileset = useCallback((name) => {
    tilesets.save({ name, tileSize, definition: currentTilesetDefinition() })
  }, [tilesets, tileSize, currentTilesetDefinition])

  const handleLoadTileset = useCallback((row) => {
    const size = row.tile_size
    setTileSize(size)
    drawing.resetCanvas(size)
    const bytes = applyTilesetDefinition(row.definition, size)
    setActiveEditorSavedTilesetId(row.id)
    const fallbackTiles = tilesFromDefinition(row.definition, size)
    const resolvedColors = row.definition?.colors || inferColorsFromTiles(fallbackTiles)
    if (resolvedColors) {
      setLocalBiome(prev => ({
        ...prev,
        id: row.definition?.biomeId || prev.id || 'custom',
        label: row.name || row.definition?.label || prev.label,
        colors: { ...prev.colors, ...resolvedColors },
      }))
    }
    if (bytes) drawing.loadPixels(bytes)
  }, [drawing, applyTilesetDefinition])

  const handleSaveLevel = useCallback((name) => {
    if (!level.layers.length) return
    levels.save({
      name, width: level.width, height: level.height, tileSize,
      layers: level.layers.map(layer => {
        const manualOut = new Uint8ClampedArray(layer.manualTiles.length)
        for (let i = 0; i < layer.manualTiles.length; i++) manualOut[i] = layer.manualTiles[i] + 1
        return {
          id: layer.id,
          name: layer.name,
          kind: layer.kind || 'autotile',
          visible: layer.visible !== false,
          tileset: layer.tileset,
          gridB64: bytesToBase64(layer.grid),
          manualTilesB64: bytesToBase64(manualOut),
        }
      }),
      placedProps: level.placedProps,
      seamlessEdges: level.seamlessEdges,
    })
  }, [levels, level, tileSize])

  const handleLoadLevel = useCallback((row) => {
    const size = row.tile_size || tileSize
    let loadedLayers
    if (row.layers?.length > 0) {
      loadedLayers = row.layers.map(l => ({
        id: l.id, name: l.name, visible: l.visible !== false, tileset: l.tileset || null,
        kind: l.kind || 'autotile',
        grid: new Uint8Array(base64ToBytes(l.gridB64 || '')),
        manualTiles: l.manualTilesB64
          ? Int16Array.from(base64ToBytes(l.manualTilesB64), v => v - 1)
          : new Int16Array(row.width * row.height).fill(-1),
      }))
    } else {
      // Legacy single-layer format
      const grid = row.grid ? base64ToBytes(row.grid) : new Uint8Array(row.width * row.height)
      const manualTiles = row.manual_tiles
        ? Int16Array.from(base64ToBytes(row.manual_tiles), v => v - 1)
        : new Int16Array(row.width * row.height).fill(-1)
      loadedLayers = [{
        id: `layer-${Date.now()}`, name: 'Layer 1', visible: true,
        kind: 'autotile',
        tileset: row.tileset ? { name: 'Base', tileSize: size, definition: row.tileset } : null,
        grid, manualTiles,
      }]
    }
    const mainDef = loadedLayers[0]?.tileset?.definition ?? row.tileset
    setTileSize(size)
    drawing.resetCanvas(size)
    if (mainDef) { const bytes = applyTilesetDefinition(mainDef, size); if (bytes) drawing.loadPixels(bytes) }
    level.loadState({ width: row.width, height: row.height, layers: loadedLayers, placedProps: row.placed_props })
    level.setSeamlessEdges(!!row.seamless_edges)
  }, [drawing, applyTilesetDefinition, level, tileSize])

  const handleSurprise = useCallback(() => {
    const keys = Object.keys(GENERATORS)
    level.generate(keys[Math.floor(Math.random() * keys.length)])
  }, [level])

  const handleTerrainStart = useCallback((x, y, erase, brushSize = 1) => {
    const shouldErase = erase || terrainTool === 'eraser'
    const targetManual = activeLayer?.kind === 'manual'
    if (targetManual) {
      level.paintManualArea(x, y, shouldErase ? -1 : manualSelectedTile, brushSize)
      return
    }
    level.paintArea(x, y, shouldErase ? 0 : 1, brushSize)
    level.clearManualArea(x, y, brushSize)
  }, [level, activeLayer, manualSelectedTile, terrainTool])

  const handleTerrainContinue = useCallback((x, y, brushSize = 1) => {
    const targetManual = activeLayer?.kind === 'manual'
    if (targetManual) {
      const erase = terrainTool === 'eraser'
      level.paintManualArea(x, y, erase ? -1 : manualSelectedTile, brushSize)
      return
    }
    const erase = terrainTool === 'eraser'
    level.paintArea(x, y, erase ? 0 : 1, brushSize)
    level.clearManualArea(x, y, brushSize)
  }, [level, activeLayer, terrainTool, manualSelectedTile])

  const handleTerrainFill = useCallback((x, y, erase) => {
    const shouldErase = erase || terrainTool === 'eraser'
    if (activeLayer?.kind === 'manual') {
      level.fillManualAt(x, y, shouldErase ? -1 : manualSelectedTile)
      return
    }
    level.fillAt(x, y, shouldErase ? 0 : 1)
    level.clearManualFill(x, y)
  }, [level, activeLayer, manualSelectedTile, terrainTool])

  const handleTerrainRect = useCallback((a, b, erase) => {
    const shouldErase = erase || terrainTool === 'eraser'
    if (activeLayer?.kind === 'manual') {
      level.fillManualRect(a, b, shouldErase ? -1 : manualSelectedTile)
      return
    }
    level.fillRect(a, b, shouldErase ? 0 : 1)
    level.clearManualRect(a, b)
  }, [level, activeLayer, manualSelectedTile, terrainTool])

  const handleTerrainPick = useCallback((x, y) => {
    if (activeLayer?.kind === 'manual') {
      const manual = level.getManualTile(x, y)
      if (manual >= 0) { setManualSelectedTile(manual); return }
      return
    }
    const value = level.getCell(x, y)
    setTerrainTool(value ? 'brush' : 'eraser')
  }, [level, activeLayer])

  const handleFillActiveLayer = useCallback(() => {
    if (activeLayer?.kind === 'manual') {
      level.fillManualAll(manualSelectedTile)
      return
    }
    level.fillAll()
  }, [activeLayer, level, manualSelectedTile])

  const handleClearActiveLayer = useCallback(() => {
    if (activeLayer?.kind === 'manual') {
      level.clearManualTiles()
      return
    }
    level.clear()
  }, [activeLayer, level])

  useEffect(() => {
    if (!activeLayer) return
    const nextMode = activeLayer.kind === 'manual' ? 'manual' : 'autotile'
    setLevelMode(prev => prev === nextMode ? prev : nextMode)
  }, [activeLayer?.id, activeLayer?.kind])

  const galleryActiveBiomeId = activeView === 'level'
    ? (activeLayer?.tileset?.definition?.biomeId ?? null)
    : (activeEditorSavedTilesetId ? null : localBiome.id)
  const galleryActiveSavedId = activeView === 'level'
    ? (activeLayer?.tileset?.savedId ?? null)
    : activeEditorSavedTilesetId

  const galleryDock = (
    <GalleryDock
      biomes={BIOMES}
      activeBiomeId={galleryActiveBiomeId}
      activeSavedTilesetId={galleryActiveSavedId}
      onSelectBiome={activeView === 'level'
        ? (biome) => level.setLayerProp(level.activeLayerIdx, {
            tileset: { name: biome.label, tileSize, definition: { mode: 'procedural', biomeId: biome.id, colors: biome.colors } },
          })
        : handleSelectBiome}
      tilesets={tilesets.tilesets}
      defaultName={mode === 'draw' ? 'Drawn tileset' : localBiome.label}
      onSaveTileset={handleSaveTileset}
      onLoadTileset={activeView === 'level'
        ? (row) => level.setLayerProp(level.activeLayerIdx, {
            tileset: { name: row.name, tileSize: row.tile_size, definition: row.definition, savedId: row.id },
          })
        : handleLoadTileset}
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
            options={[{ value: 8, label: '8' }, { value: 16, label: '16' }, { value: 32, label: '32' }, { value: 64, label: '64' }]} />
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
            layerTiles={layerTiles}
            assets={assets.assets} assetsById={assetsById}
            selectedAssetId={assets.selectedId} onSelectAsset={assets.select}
            onPlaceProp={handlePlaceProp} onRemovePropAt={handleRemovePropAt}
            onTerrainStart={handleTerrainStart} onTerrainContinue={handleTerrainContinue}
            onTerrainFill={handleTerrainFill} onTerrainRect={handleTerrainRect} onTerrainPick={handleTerrainPick}
            onFillActiveLayer={handleFillActiveLayer} onClearActiveLayer={handleClearActiveLayer}
            onSurprise={handleSurprise}
            levels={levels.levels} onSaveLevel={handleSaveLevel} onLoadLevel={handleLoadLevel} onRemoveLevel={levels.remove}
          />
          {galleryDock}
        </>
      )}
    </div>
  )
}

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

function cloneColors(colors) {
  return {
    primary: colors?.primary || '#4a7c2f',
    secondary: colors?.secondary || '#3d6626',
    border: colors?.border || '#1e3a0f',
    highlight: colors?.highlight || '#6db84a',
    shadow: colors?.shadow || '#2a4a1a',
  }
}

// Resample a square RGBA texture (stored at its own native size) to size×size.
// AI textures are captured at the tile size they were generated for; when the
// global tile size changes, the bytes no longer match size*size*4, so we must
// rescale them (nearest-neighbour) before composing the 48 tiles.
function textureToImageData(bytes, size) {
  const data = bytes instanceof Uint8ClampedArray ? bytes : new Uint8ClampedArray(bytes)
  const native = Math.round(Math.sqrt(data.length / 4))
  if (native === size) return new ImageData(new Uint8ClampedArray(data), size, size)
  const src = document.createElement('canvas')
  src.width = native; src.height = native
  src.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data), native, native), 0, 0)
  const dst = document.createElement('canvas')
  dst.width = size; dst.height = size
  const ctx = dst.getContext('2d')
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(src, 0, 0, native, native, 0, 0, size, size)
  return ctx.getImageData(0, 0, size, size)
}

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

function createEditorTilesetDescriptor({
  name,
  biomeId = null,
  colors,
  baseColors = null,
  savedId = null,
  isCustom = false,
}) {
  const resolvedColors = cloneColors(colors)
  return {
    name: name || 'Custom',
    biomeId,
    colors: resolvedColors,
    baseColors: cloneColors(baseColors || resolvedColors),
    savedId,
    isCustom,
  }
}

function distanceSq(a, b) {
  const dr = a[0] - b[0]
  const dg = a[1] - b[1]
  const db = a[2] - b[2]
  return dr * dr + dg * dg + db * db
}

function remapBaseTilePixels(bytes, fromColors, toColors) {
  const src = new Uint8ClampedArray(bytes)
  const fromPalette = [
    cloneColors(fromColors).primary,
    cloneColors(fromColors).secondary,
    cloneColors(fromColors).border,
    cloneColors(fromColors).highlight,
    cloneColors(fromColors).shadow,
  ].map(hex => {
    const clean = hex.replace('#', '')
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ]
  })
  const toPalette = [
    cloneColors(toColors).primary,
    cloneColors(toColors).secondary,
    cloneColors(toColors).border,
    cloneColors(toColors).highlight,
    cloneColors(toColors).shadow,
  ].map(hex => {
    const clean = hex.replace('#', '')
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ]
  })

  for (let i = 0; i < src.length; i += 4) {
    if (src[i + 3] === 0) continue
    const rgb = [src[i], src[i + 1], src[i + 2]]
    let nearest = 0
    let best = Number.POSITIVE_INFINITY
    for (let p = 0; p < fromPalette.length; p++) {
      const dist = distanceSq(rgb, fromPalette[p])
      if (dist < best) {
        best = dist
        nearest = p
      }
    }
    src[i] = toPalette[nearest][0]
    src[i + 1] = toPalette[nearest][1]
    src[i + 2] = toPalette[nearest][2]
  }

  return src
}

function descriptorFromBiome(biome) {
  return createEditorTilesetDescriptor({
    name: biome.label,
    biomeId: biome.id,
    colors: biome.colors,
    baseColors: biome.colors,
    savedId: null,
    isCustom: false,
  })
}

export default function App() {
  const [activeView, setActiveView] = useState('editor') // 'editor' | 'level'
  const [editorKind, setEditorKind] = useState('tileset') // 'tileset' | 'prop'
  const [tileSize, setTileSize]     = useState(16)
  const [mode, setMode]             = useState('procedural') // 'procedural' | 'draw'
  const [levelMode, setLevelMode]   = useState('autotile')   // 'autotile' | 'manual'
  const [manualSelectedTile, setManualSelectedTile] = useState(1)
  const [editorTileset, setEditorTileset] = useState(() => descriptorFromBiome(BIOMES[0]))
  const [editorSourceDef, setEditorSourceDef] = useState(() => ({
    mode: 'procedural',
    biomeId: BIOMES[0].id,
    label: BIOMES[0].label,
    colors: cloneColors(BIOMES[0].colors),
  }))

  const drawing   = useDrawingCanvas(tileSize)
  const tilesheet = useTilesheet()
  const level     = useLevelMap(32, 20)
  const assets    = useAssets()
  const tilesets  = useTilesets()
  const levels    = useLevels()

  // "Latest ref" pattern: effects that call into these hooks read .current so
  // they don't have to list the (unstable, recreated-every-render) hook objects
  // as dependencies — which would cause infinite re-render loops.
  const drawingRef   = useRef(drawing);   drawingRef.current = drawing
  const tilesheetRef = useRef(tilesheet); tilesheetRef.current = tilesheet

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
  // null tileset = use current editor tileset; otherwise computed from definition.
  // Cached in a WeakMap by the `layer.tileset` object reference: regenerating the
  // 48 tiles is expensive, and during painting `level.layers` is rebuilt every
  // RAF flush while the tileset object stays the same reference, so a reference
  // key is both correct and avoids hashing the (large, base64-laden) definition.
  const layerTilesCache = useRef(new WeakMap())
  const editorLayerTile = useMemo(() => ({ tiles: tilesheet.tiles, tileSize }), [tilesheet.tiles, tileSize])
  const layerTiles = useMemo(() => (
    level.layers.map(layer => {
      if (!layer.tileset) return editorLayerTile
      const cache = layerTilesCache.current
      if (!cache.has(layer.tileset)) {
        cache.set(layer.tileset, {
          tiles: tilesFromDefinition(layer.tileset.definition, layer.tileset.tileSize),
          tileSize: layer.tileset.tileSize,
        })
      }
      return cache.get(layer.tileset)
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

  const [aiTextures, setAiTextures] = useState(null)

  useEffect(() => {
    tilesheet.generateFromBiome({ ...BIOMES[0], colors: cloneColors(BIOMES[0].colors) }, tileSize)
  }, []) // eslint-disable-line

  const handleTileSizeChange = (newSize) => {
    setTileSize(newSize)
    drawing.resetCanvas(newSize)
    if (mode === 'procedural') {
      const palette = editorTileset.colors
      if (aiTextures?.center) {
        const centerData = textureToImageData(aiTextures.center, newSize)
        const edgeData = aiTextures.edge ? textureToImageData(aiTextures.edge, newSize) : null
        tilesheet.generateFromTextures(centerData, edgeData, newSize, palette)
      } else {
        const base = BIOME_MAP[editorTileset.biomeId] || BIOMES[0]
        tilesheet.generateFromBiome({ ...base, label: editorTileset.name, colors: cloneColors(palette) }, newSize)
      }
    }
  }

  // Keyboard shortcuts (tileset draw mode only)
  useEffect(() => {
    const handleKey = (e) => {
      if (activeView !== 'editor' || editorKind !== 'tileset' || mode !== 'draw') return
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); drawingRef.current.undo() }
      if (e.ctrlKey && e.key === 'y') { e.preventDefault(); drawingRef.current.redo() }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [activeView, editorKind, mode])

  const handleGenerate = () => {
    if (mode === 'draw') {
      tilesheet.generateFromBitmap(drawing.getImageData(), tileSize)
    } else if (aiTextures?.center) {
      const centerData = new ImageData(new Uint8ClampedArray(aiTextures.center), tileSize, tileSize)
      const edgeData = aiTextures.edge
        ? new ImageData(new Uint8ClampedArray(aiTextures.edge), tileSize, tileSize)
        : null
      tilesheet.generateFromTextures(centerData, edgeData, tileSize, editorTileset.colors)
    } else {
      const base = BIOME_MAP[editorTileset.biomeId] || BIOMES[0]
      tilesheet.generateFromBiome({ ...base, label: editorTileset.name, colors: cloneColors(editorTileset.colors) }, tileSize)
    }
  }

  const handleSelectBiome = useCallback((biome) => {
    const fresh = { ...biome, colors: cloneColors(biome.colors) }
    setEditorTileset(descriptorFromBiome(fresh))
    setEditorSourceDef({
      mode: 'procedural',
      biomeId: fresh.id,
      label: fresh.label,
      colors: cloneColors(fresh.colors),
    })
    setAiTextures(null)
    tilesheet.generateFromBiome(fresh, tileSize)
  }, [tileSize, tilesheet])

  const handleColorChange = (key, value) => {
    setEditorTileset(prev => ({
      ...prev,
      colors: { ...prev.colors, [key]: value },
    }))
  }

  const handleResetBiomeColors = useCallback(() => {
    setEditorTileset(prev => ({
      ...prev,
      colors: cloneColors(prev.baseColors),
    }))
  }, [])

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
    setEditorTileset(prev => ({
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
    tilesheet.generateFromTextures(centerData, edgeData, tileSize, editorTileset.colors)
    setAiTextures({ center, edge })
    setEditorTileset(prev => ({
      ...prev,
      savedId: null,
      isCustom: true,
    }))
    setEditorSourceDef({
      mode: 'textures',
      centerPixels: bytesToBase64(center),
      edgePixels: edge ? bytesToBase64(edge) : null,
      biomeId: editorTileset.biomeId,
      label: editorTileset.name,
      colors: cloneColors(editorTileset.colors),
    })
  }, [tileSize, tilesheet, editorTileset.colors])

  const currentTilesetDefinition = useCallback(() => {
    if (mode === 'draw') return {
      mode: 'draw',
      basePixels: bytesToBase64(drawing.committedPixels),
      label: editorTileset.name,
      colors: editorTileset.colors,
    }
    if (aiTextures) return {
      mode: 'textures',
      centerPixels: bytesToBase64(aiTextures.center),
      edgePixels: aiTextures.edge ? bytesToBase64(aiTextures.edge) : null,
      biomeId: editorTileset.biomeId,
      label: editorTileset.name,
      colors: editorTileset.colors,
    }
    return { mode: 'procedural', biomeId: editorTileset.biomeId, label: editorTileset.name, colors: editorTileset.colors }
  }, [mode, drawing.committedPixels, editorTileset, aiTextures])

  // `generate` controls whether the 48-tile sheet is rendered here. The editor
  // tileset-load path passes false because the saved-tileset effect regenerates
  // once afterwards; the level-load path keeps it true (that effect is inactive
  // in level view). Avoids rendering the sheet 2-3× per selection.
  const applyTilesetDefinition = useCallback((def, size, generate = true) => {
    if (!def) return
    if (def.mode === 'draw') {
      setMode('draw')
      setAiTextures(null)
      const bytes = base64ToBytes(def.basePixels)
      const side = Math.round(Math.sqrt(bytes.length / 4))
      if (generate) tilesheet.generateFromBitmap(new ImageData(new Uint8ClampedArray(bytes), side, side), size)
      const inferred = def.colors || inferColorsFromTiles(tilesFromDefinition(def, size)) || BIOMES[0].colors
      setEditorTileset(createEditorTilesetDescriptor({
        name: def.label || 'Drawn tileset',
        biomeId: null,
        colors: inferred,
        baseColors: inferred,
        savedId: null,
        isCustom: true,
      }))
      setEditorSourceDef({
        mode: 'draw',
        basePixels: def.basePixels,
        label: def.label || 'Drawn tileset',
        colors: cloneColors(inferred),
      })
      return bytes
    }
    if (def.mode === 'textures') {
      setMode('procedural')
      const center = new Uint8ClampedArray(base64ToBytes(def.centerPixels))
      const edge   = def.edgePixels ? new Uint8ClampedArray(base64ToBytes(def.edgePixels)) : null
      const inferred = def.colors || inferColorsFromTiles(tilesFromDefinition(def, size)) || BIOMES[0].colors
      if (generate) {
        const centerData = textureToImageData(center, size)
        const edgeData   = edge ? textureToImageData(edge, size) : null
        tilesheet.generateFromTextures(centerData, edgeData, size, inferred)
      }
      const base = def.biomeId ? BIOME_MAP[def.biomeId] : null
      setEditorTileset(createEditorTilesetDescriptor({
        name: def.label || base?.label || 'Custom textured',
        biomeId: base?.id || null,
        colors: inferred,
        baseColors: def.colors || inferred,
        savedId: null,
        isCustom: !base,
      }))
      setEditorSourceDef({
        ...def,
        label: def.label || base?.label || 'Custom textured',
        colors: cloneColors(def.colors || inferred),
      })
      setAiTextures({ center, edge })
      return null
    }
    setMode('procedural')
    setAiTextures(null)
    const base = def.biomeId ? BIOME_MAP[def.biomeId] : null
    const inferred = def.colors || inferColorsFromTiles(tilesFromDefinition(def, size)) || BIOMES[0].colors
    const biome = {
      ...(base || BIOMES[0]),
      label: def.label || base?.label || 'Custom procedural',
      colors: cloneColors(inferred),
    }
    setEditorTileset(createEditorTilesetDescriptor({
      name: biome.label,
      biomeId: base?.id || null,
      colors: inferred,
      baseColors: def.colors || inferred,
      savedId: null,
      isCustom: !base,
    }))
    setEditorSourceDef({
      ...def,
      label: biome.label,
      colors: cloneColors(def.colors || inferred),
    })
    if (generate) tilesheet.generateFromBiome(biome, size)
    return null
  }, [tilesheet])

  const handleSaveTileset = useCallback((name) => {
    tilesets.save({ name, tileSize, definition: currentTilesetDefinition() })
  }, [tilesets, tileSize, currentTilesetDefinition])

  const handleLoadTileset = useCallback((row) => {
    const size = row.tile_size
    setTileSize(size)
    drawing.resetCanvas(size)
    // Defer the 48-tile generation to the saved-tileset effect below when we're
    // in the tileset editor: setting savedId triggers it to regenerate once from
    // editorSourceDef + colors, so generating here too would render the sheet
    // 2-3× per selection. Outside that view the effect is inactive, so generate
    // synchronously. Colors are inferred only when the definition didn't store them.
    applyTilesetDefinition(row.definition, size, editorKind !== 'tileset')
    const resolvedColors = row.definition?.colors
      || inferColorsFromTiles(tilesFromDefinition(row.definition, size))
      || BIOMES[0].colors
    if (resolvedColors) {
      const base = row.definition?.biomeId ? BIOME_MAP[row.definition.biomeId] : null
      setEditorTileset(createEditorTilesetDescriptor({
        name: row.name || row.definition?.label || base?.label || 'Saved tileset',
        biomeId: base?.id || null,
        colors: resolvedColors,
        baseColors: row.definition?.colors || resolvedColors,
        savedId: row.id,
        isCustom: !base,
      }))
      setEditorSourceDef({
        ...row.definition,
        label: row.name || row.definition?.label || base?.label || 'Saved tileset',
        colors: cloneColors(row.definition?.colors || resolvedColors),
      })
    }
    // The saved-tileset effect (draw branch) loads the recolored base pixels, so
    // no drawing.loadPixels here — doing both double-loads + double-pushes history.
  }, [drawing, applyTilesetDefinition, editorKind])

  useEffect(() => {
    if (activeView !== 'editor' || editorKind !== 'tileset') return
    if (!editorTileset.savedId) return
    if (!editorSourceDef) return

    if (editorSourceDef.mode === 'draw' && editorSourceDef.basePixels) {
      const bytes = base64ToBytes(editorSourceDef.basePixels)
      const recolored = remapBaseTilePixels(bytes, editorSourceDef.colors || editorTileset.baseColors, editorTileset.colors)
      drawingRef.current.loadPixels(recolored)
      const side = Math.round(Math.sqrt(recolored.length / 4))
      tilesheetRef.current.generateFromBitmap(new ImageData(recolored, side, side), side)
      return
    }

    if (editorSourceDef.mode === 'textures' && editorSourceDef.centerPixels) {
      const centerData = textureToImageData(base64ToBytes(editorSourceDef.centerPixels), tileSize)
      const edgeData = editorSourceDef.edgePixels
        ? textureToImageData(base64ToBytes(editorSourceDef.edgePixels), tileSize)
        : null
      tilesheetRef.current.generateFromTextures(centerData, edgeData, tileSize, editorTileset.colors)
      return
    }

    const base = editorSourceDef.biomeId ? BIOME_MAP[editorSourceDef.biomeId] : BIOMES[0]
    tilesheetRef.current.generateFromBiome({
      ...base,
      label: editorTileset.name,
      colors: cloneColors(editorTileset.colors),
    }, tileSize)
  }, [
    activeView,
    editorKind,
    editorTileset.savedId,
    editorTileset.colors,
    editorTileset.baseColors,
    editorTileset.name,
    editorSourceDef,
    tileSize,
  ])

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

  // A saved tileset can carry a biomeId in its definition; don't also light up
  // the biome card when a saved tileset is the active selection.
  const galleryActiveBiomeId = activeView === 'level'
    ? (activeLayer?.tileset?.savedId ? null : (activeLayer?.tileset?.definition?.biomeId ?? null))
    : (editorTileset.savedId ? null : editorTileset.biomeId)
  const galleryActiveSavedId = activeView === 'level'
    ? (activeLayer?.tileset?.savedId ?? null)
    : editorTileset.savedId

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
      defaultName={mode === 'draw' ? 'Drawn tileset' : editorTileset.name}
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
            biome={editorTileset} onColorChange={handleColorChange}
            onResetColors={handleResetBiomeColors} onShuffleColors={handleShuffleBiomeColors}
            drawing={drawing} tiles={tilesheet.tiles}
            onGenerate={handleGenerate} onAITile={drawing.loadPixels} onAIProcedural={handleAIProcedural}
            biomeId={editorTileset.biomeId} savedCount={tilesets.tilesets.length}
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

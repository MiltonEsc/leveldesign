import { useRef, useEffect, useLayoutEffect, useCallback, useMemo, useState } from 'react'
import { Application, Container, Rectangle, Sprite, Texture } from 'pixi.js'
import { computeIndexMap, patchIndexMap, patchIndexMapFromCells } from '../../core/autotile.js'
import { composeNativeSheet } from '../../core/composeSheet.js'
import { MIN_CELL_PX, MAX_CELL_PX, ZOOM_STEP } from './zoomConfig.js'

function assetToCanvas(asset) {
  const pxW = asset.cols * asset.tileSize
  const pxH = asset.rows * asset.tileSize
  const c = document.createElement('canvas')
  c.width = pxW
  c.height = pxH
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(asset.pixels), pxW, pxH), 0, 0)
  return c
}

export function LevelCanvas({
  layers = [], layerTiles = [],
  width, height, tileSize, cellPx, setCellPx, seamlessEdges, showGrid,
  onStartPaint, onContinuePaint, onEndPaint,
  terrainTool = 'brush', terrainBrushSize = 1, onFillTerrain, onRectTerrain, onPickTerrain,
  levelTool = 'terrain', placedProps = [], assetsById = {}, selectedAssetId = null,
  onPlaceProp, onRemovePropAt,
}) {
  const wrapperRef = useRef(null)
  const pixiHostRef = useRef(null)
  const overlayRef = useRef(null)
  const painting = useRef(false)
  const hoverCell = useRef(null)
  const zoomAnchor = useRef(null)
  const rectDrag = useRef(null)
  const lastPaintCell = useRef(null)

  const appRef = useRef(null)
  const appReadyRef = useRef(false)
  const terrainContainerRef = useRef(null)
  const propsContainerRef = useRef(null)
  const layerStateCacheRef = useRef(new Map())
  const terrainTextureCache = useRef(new WeakMap())
  const assetTextureCache = useRef(new Map())
  const [pixiReady, setPixiReady] = useState(false)

  const displayW = width * cellPx
  const displayH = height * cellPx
  const cursor = levelTool === 'props' ? (selectedAssetId != null ? 'copy' : 'not-allowed') : 'crosshair'

  const forEachCellOnLine = useCallback((fromX, fromY, toX, toY, visit) => {
    let x = fromX
    let y = fromY
    const dx = Math.abs(toX - fromX)
    const dy = Math.abs(toY - fromY)
    const sx = fromX < toX ? 1 : -1
    const sy = fromY < toY ? 1 : -1
    let err = dx - dy

    while (true) {
      visit(x, y)
      if (x === toX && y === toY) break
      const e2 = err * 2
      if (e2 > -dy) {
        err -= dy
        x += sx
      }
      if (e2 < dx) {
        err += dx
        y += sy
      }
    }
  }, [])

  const assetTextures = useMemo(() => {
    const cache = {}
    const ids = new Set(placedProps.map(p => p.assetId))
    if (selectedAssetId != null) ids.add(selectedAssetId)

    for (const id of ids) {
      const asset = assetsById[id]
      if (!asset) continue

      const cacheKey = `${asset.id}:${asset.cols}:${asset.rows}:${asset.tileSize}:${asset.pixels?.byteLength || asset.pixels?.length || 0}`
      const cached = assetTextureCache.current.get(cacheKey)
      if (cached) {
        cache[id] = cached
        continue
      }

      const canvas = assetToCanvas(asset)
      const texture = Texture.from(canvas, true)
      const entry = { texture, cols: asset.cols, rows: asset.rows }
      assetTextureCache.current.set(cacheKey, entry)
      cache[id] = entry
    }

    return cache
  }, [placedProps, assetsById, selectedAssetId])

  const getTerrainTextures = useCallback((layerTile) => {
    if (!layerTile?.tiles?.length) return null

    const cached = terrainTextureCache.current.get(layerTile)
    if (cached && cached.tileSize === (layerTile.tileSize || tileSize)) return cached

    const native = composeNativeSheet(layerTile.tiles, layerTile.tileSize || tileSize)
    const sheetTexture = Texture.from(native, true)
    const source = sheetTexture.source
    const sourceTileSize = layerTile.tileSize || tileSize

    const textures = Array.from({ length: 48 }, (_, idx) => new Texture({
      source,
      frame: new Rectangle((idx % 8) * sourceTileSize, Math.floor(idx / 8) * sourceTileSize, sourceTileSize, sourceTileSize),
    }))

    const entry = { tileSize: sourceTileSize, textures, sheetTexture }
    terrainTextureCache.current.set(layerTile, entry)
    return entry
  }, [tileSize])

  useEffect(() => {
    let cancelled = false
    const app = new Application()

    const init = async () => {
      await app.init({
        width: Math.max(1, width * tileSize),
        height: Math.max(1, height * tileSize),
        antialias: false,
        autoDensity: false,
        resolution: 1,
        backgroundAlpha: 0,
        preference: 'webgl',
        powerPreference: 'high-performance',
      })
      appReadyRef.current = true
      if (cancelled) {
        app.destroy()
        return
      }

      app.canvas.style.width = '100%'
      app.canvas.style.height = '100%'
      app.canvas.style.display = 'block'
      app.canvas.style.imageRendering = 'pixelated'

      const terrain = new Container()
      const props = new Container()
      app.stage.addChild(terrain)
      app.stage.addChild(props)

      terrainContainerRef.current = terrain
      propsContainerRef.current = props
      appRef.current = app
      pixiHostRef.current?.appendChild(app.canvas)
      setPixiReady(true)
    }

    init()

    return () => {
      cancelled = true
      setPixiReady(false)
      appReadyRef.current = false
      layerStateCacheRef.current = new Map()
      appRef.current = null
      terrainContainerRef.current = null
      propsContainerRef.current = null
      if (app.renderer) app.destroy()
    }
  }, [])

  useEffect(() => {
    const app = appRef.current
    if (!app) return
    app.renderer.resize(Math.max(1, width * tileSize), Math.max(1, height * tileSize))
  }, [width, height, tileSize])

  useEffect(() => {
    if (!pixiReady || !terrainContainerRef.current) return
    const terrainContainer = terrainContainerRef.current
    const border = seamlessEdges ? 1 : 0
    const expected = width * height
    const activeIds = new Set(layers.map(layer => layer.id))

    for (const [layerId, state] of layerStateCacheRef.current.entries()) {
      if (activeIds.has(layerId)) continue
      terrainContainer.removeChild(state.container)
      state.container.destroy({ children: true })
      layerStateCacheRef.current.delete(layerId)
    }

    const ensureLayerState = (layer, layerIdx) => {
      let state = layerStateCacheRef.current.get(layer.id)
      if (!state) {
        const container = new Container()
        terrainContainer.addChild(container)
        state = {
          container,
          sprites: [],
          indexMap: null,
          grid: null,
          manualTiles: null,
          tileRef: null,
          border: null,
          width: 0,
          height: 0,
        }
        layerStateCacheRef.current.set(layer.id, state)
      } else if (terrainContainer.getChildIndex(state.container) !== layerIdx) {
        terrainContainer.setChildIndex(state.container, Math.min(layerIdx, terrainContainer.children.length - 1))
      }

      state.container.visible = layer.visible !== false
      if (state.sprites.length !== expected || state.width !== width || state.height !== height) {
        state.container.removeChildren()
        state.sprites = []
        for (let cell = 0; cell < expected; cell++) {
          const sprite = new Sprite(Texture.EMPTY)
          sprite.visible = false
          sprite.roundPixels = true
          sprite.x = (cell % width) * tileSize
          sprite.y = ((cell / width) | 0) * tileSize
          sprite.width = tileSize
          sprite.height = tileSize
          state.container.addChild(sprite)
          state.sprites.push(sprite)
        }
        state.indexMap = null
        state.grid = null
        state.manualTiles = null
        state.width = width
        state.height = height
      } else {
        for (let cell = 0; cell < expected; cell++) {
          const sprite = state.sprites[cell]
          sprite.x = (cell % width) * tileSize
          sprite.y = ((cell / width) | 0) * tileSize
          sprite.width = tileSize
          sprite.height = tileSize
        }
      }
      return state
    }

    layers.forEach((layer, layerIdx) => {
      const layerTile = layerTiles[layerIdx]
      const textureEntry = getTerrainTextures(layerTile)
      if (!textureEntry) return
      const state = ensureLayerState(layer, layerIdx)
      const textures = textureEntry.textures
      const fullRebuild = !state.indexMap
        || state.tileRef !== layerTile
        || state.border !== border

      let indexMap = state.indexMap
      let dirtyCells = []

      if (fullRebuild) {
        indexMap = computeIndexMap(layer.grid, width, height, border)
        dirtyCells = Array.from({ length: expected }, (_, cell) => cell)
      } else if (state.grid !== layer.grid) {
        const dirty = []
        const terrainDirty = Array.isArray(layer._dirtyTerrain) ? layer._dirtyTerrain : null
        indexMap = terrainDirty?.length
          ? patchIndexMapFromCells(state.indexMap, layer.grid, terrainDirty, width, height, border, dirty).map
          : patchIndexMap(state.indexMap, state.grid, layer.grid, width, height, border, dirty).map
        dirtyCells = dirty
      }

      if (state.manualTiles !== layer.manualTiles) {
        const manualDirty = Array.isArray(layer._dirtyManual) ? layer._dirtyManual : null
        if (manualDirty?.length) {
          const merged = new Set(dirtyCells)
          for (const cell of manualDirty) merged.add(cell)
          dirtyCells = [...merged]
        } else if (!fullRebuild) {
          const merged = new Set(dirtyCells)
          for (let cell = 0; cell < layer.manualTiles.length; cell++) {
            if (state.manualTiles?.[cell] !== layer.manualTiles[cell]) merged.add(cell)
          }
          dirtyCells = [...merged]
        }
      }

      for (const cell of dirtyCells) {
        const sprite = state.sprites[cell]
        const manualIdx = layer.manualTiles[cell]
        const idx = layer.kind === 'manual'
          ? manualIdx
          : (manualIdx >= 0 ? manualIdx : (indexMap[cell] ?? 0))
        const isEmpty = layer.kind === 'manual' ? idx < 0 : !idx
        if (isEmpty) {
          sprite.visible = false
          sprite.texture = Texture.EMPTY
          continue
        }
        sprite.texture = textures[idx] || Texture.EMPTY
        sprite.visible = true
      }

      state.indexMap = indexMap
      state.grid = layer.grid
      state.manualTiles = layer.manualTiles
      state.tileRef = layerTile
      state.border = border
    })
  }, [pixiReady, layers, layerTiles, width, height, tileSize, seamlessEdges, getTerrainTextures])

  useEffect(() => {
    if (!pixiReady || !propsContainerRef.current) return

    const propsContainer = propsContainerRef.current
    propsContainer.removeChildren()

    for (const placed of placedProps) {
      const entry = assetTextures[placed.assetId]
      if (!entry) continue
      const sprite = new Sprite(entry.texture)
      sprite.roundPixels = true
      sprite.x = placed.x * tileSize
      sprite.y = placed.y * tileSize
      sprite.width = entry.cols * tileSize
      sprite.height = entry.rows * tileSize
      propsContainer.addChild(sprite)
    }
  }, [pixiReady, placedProps, assetTextures, tileSize])

  const drawOverlay = useCallback(() => {
    const canvas = overlayRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dW = width * cellPx
    const dH = height * cellPx

    if (canvas.width !== dW || canvas.height !== dH) {
      canvas.width = dW
      canvas.height = dH
    }

    ctx.clearRect(0, 0, dW, dH)

    if (showGrid) {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx.lineWidth = 1
      for (let x = 0; x <= width; x++) { ctx.beginPath(); ctx.moveTo(x * cellPx, 0); ctx.lineTo(x * cellPx, dH); ctx.stroke() }
      for (let y = 0; y <= height; y++) { ctx.beginPath(); ctx.moveTo(0, y * cellPx); ctx.lineTo(dW, y * cellPx); ctx.stroke() }
    }

    if (levelTool === 'props' && hoverCell.current && selectedAssetId != null) {
      const entry = assetTextures[selectedAssetId]
      if (entry) {
        const [hx, hy] = hoverCell.current
        ctx.imageSmoothingEnabled = false
        ctx.globalAlpha = 0.55
        ctx.drawImage(entry.texture.source.resource, hx * cellPx, hy * cellPx, entry.cols * cellPx, entry.rows * cellPx)
        ctx.globalAlpha = 1
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'
        ctx.lineWidth = 1
        ctx.strokeRect(hx * cellPx + 0.5, hy * cellPx + 0.5, entry.cols * cellPx - 1, entry.rows * cellPx - 1)
      }
    }

    if (levelTool === 'terrain' && terrainTool === 'rect' && rectDrag.current?.cur) {
      const { start, cur } = rectDrag.current
      const x0 = Math.min(start[0], cur[0])
      const y0 = Math.min(start[1], cur[1])
      const x1 = Math.max(start[0], cur[0])
      const y1 = Math.max(start[1], cur[1])
      ctx.strokeStyle = 'rgba(47,214,166,0.95)'
      ctx.lineWidth = 2
      ctx.strokeRect(x0 * cellPx + 1, y0 * cellPx + 1, (x1 - x0 + 1) * cellPx - 2, (y1 - y0 + 1) * cellPx - 2)
    }
  }, [width, height, cellPx, showGrid, levelTool, selectedAssetId, assetTextures, terrainTool])

  useEffect(() => { drawOverlay() }, [drawOverlay])

  useLayoutEffect(() => {
    const anchor = zoomAnchor.current
    if (!anchor) return
    zoomAnchor.current = null
    const container = wrapperRef.current?.closest('.level-canvas-area')
    const rect = wrapperRef.current?.getBoundingClientRect()
    if (!container || !rect) return
    container.scrollLeft += (rect.left + anchor.worldX * cellPx) - anchor.clientX
    container.scrollTop += (rect.top + anchor.worldY * cellPx) - anchor.clientY
  }, [cellPx])

  const cellFromEvent = useCallback((e) => {
    const rect = wrapperRef.current.getBoundingClientRect()
    return [
      Math.floor((e.clientX - rect.left) / cellPx),
      Math.floor((e.clientY - rect.top) / cellPx),
    ]
  }, [cellPx])

  const handleWheel = useCallback((e) => {
    if (!setCellPx) return
    e.preventDefault()
    const dir = e.deltaY < 0 ? 1 : -1
    const newCell = Math.max(MIN_CELL_PX, Math.min(MAX_CELL_PX, cellPx + dir * ZOOM_STEP))
    if (newCell === cellPx) return
    const rect = wrapperRef.current.getBoundingClientRect()
    zoomAnchor.current = {
      worldX: (e.clientX - rect.left) / cellPx,
      worldY: (e.clientY - rect.top) / cellPx,
      clientX: e.clientX,
      clientY: e.clientY,
    }
    setCellPx(newCell)
  }, [cellPx, setCellPx])

  const handleDown = useCallback((e) => {
    e.preventDefault()
    const [x, y] = cellFromEvent(e)
    if (levelTool === 'props') {
      if (e.button === 2) onRemovePropAt?.(x, y)
      else onPlaceProp?.(x, y)
      return
    }
    if (terrainTool === 'picker') { onPickTerrain?.(x, y); return }
    if (terrainTool === 'fill') { onFillTerrain?.(x, y, e.button === 2); return }
    if (terrainTool === 'rect') {
      rectDrag.current = { start: [x, y], cur: [x, y], erase: e.button === 2 }
      drawOverlay()
      return
    }
    painting.current = true
    lastPaintCell.current = [x, y]
    onStartPaint(x, y, e.button === 2, terrainBrushSize)
  }, [cellFromEvent, drawOverlay, levelTool, onFillTerrain, onPickTerrain, onPlaceProp, onRemovePropAt, onStartPaint, terrainBrushSize, terrainTool])

  const handleMove = useCallback((e) => {
    const [x, y] = cellFromEvent(e)
    if (levelTool === 'props') {
      hoverCell.current = [x, y]
      drawOverlay()
      return
    }
    if (terrainTool === 'rect' && rectDrag.current) {
      rectDrag.current.cur = [x, y]
      drawOverlay()
      return
    }
    if (!painting.current) return
    const prev = lastPaintCell.current
    if (!prev) {
      lastPaintCell.current = [x, y]
      onContinuePaint(x, y, terrainBrushSize)
      return
    }
    if (prev[0] === x && prev[1] === y) return
    forEachCellOnLine(prev[0], prev[1], x, y, (px, py) => onContinuePaint(px, py, terrainBrushSize))
    lastPaintCell.current = [x, y]
  }, [cellFromEvent, drawOverlay, forEachCellOnLine, levelTool, onContinuePaint, terrainBrushSize, terrainTool])

  const handleUp = useCallback(() => {
    if (rectDrag.current) {
      const { start, cur, erase } = rectDrag.current
      if (cur && onRectTerrain) onRectTerrain({ x: start[0], y: start[1] }, { x: cur[0], y: cur[1] }, erase)
      rectDrag.current = null
      drawOverlay()
    }
    painting.current = false
    lastPaintCell.current = null
    onEndPaint?.()
  }, [drawOverlay, onEndPaint, onRectTerrain])

  const handleLeave = useCallback(() => {
    painting.current = false
    rectDrag.current = null
    lastPaintCell.current = null
    onEndPaint?.()
    if (hoverCell.current) {
      hoverCell.current = null
      drawOverlay()
    }
  }, [drawOverlay, onEndPaint])

  return (
    <div
      ref={wrapperRef}
      className="level-canvas-wrapper"
      style={{ position: 'relative', width: displayW, height: displayH, cursor }}
      onWheel={handleWheel}
      onMouseDown={handleDown}
      onMouseMove={handleMove}
      onMouseUp={handleUp}
      onMouseLeave={handleLeave}
      onContextMenu={e => e.preventDefault()}
    >
      <div
        ref={pixiHostRef}
        style={{ position: 'absolute', inset: 0, width: displayW, height: displayH, overflow: 'hidden' }}
      />
      <canvas
        ref={overlayRef}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none', width: displayW, height: displayH }}
      />
    </div>
  )
}

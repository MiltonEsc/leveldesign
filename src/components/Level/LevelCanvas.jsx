import { useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react'
import { computeIndexMap } from '../../core/autotile.js'
import { MIN_CELL_PX, MAX_CELL_PX, ZOOM_STEP } from './zoomConfig.js'

function assetToCanvas(asset) {
  const pxW = asset.cols * asset.tileSize
  const pxH = asset.rows * asset.tileSize
  const c = document.createElement('canvas')
  c.width = pxW; c.height = pxH
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(asset.pixels), pxW, pxH), 0, 0)
  return c
}

// Renders multiple terrain layers (bottom to top) autotiled with their own
// tilesets, plus placed props on top.
export function LevelCanvas({
  layers = [], layerTiles = [],
  width, height, tileSize, cellPx, setCellPx, seamlessEdges, showGrid,
  onStartPaint, onContinuePaint, onEndPaint,
  terrainTool = 'brush', terrainBrushSize = 1, onFillTerrain, onRectTerrain, onPickTerrain,
  levelTool = 'terrain', placedProps = [], assetsById = {}, selectedAssetId = null,
  onPlaceProp, onRemovePropAt,
}) {
  const canvasRef  = useRef(null)
  const gridRef    = useRef(null)
  const painting   = useRef(false)
  const hoverCell  = useRef(null)
  const zoomAnchor = useRef(null)
  const rectDrag   = useRef(null)
  const lastPaintCell = useRef(null)
  const layerRenderCache = useRef(new Map())
  const assetCanvasCache = useRef(new Map())

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

  // Index maps cached by layer.grid reference — only the painted layer gets a new
  // Uint8Array per stroke, so all other layers reuse their cached map instantly.
  const indexMapCache = useRef(new Map())
  const layerIndexMaps = useMemo(() => (
    layers.map(layer => {
      if (indexMapCache.current.has(layer.grid)) return indexMapCache.current.get(layer.grid)
      const map = computeIndexMap(layer.grid, width, height, seamlessEdges ? 1 : 0)
      indexMapCache.current.set(layer.grid, map)
      return map
    })
  ), [layers, width, height, seamlessEdges])

  // Per-layer tile canvases, cached by object reference (stable from App.jsx cache)
  const tileCanvasCache = useRef(new Map())
  const layerTileCanvases = useMemo(() => (
    layerTiles.map(lt => {
      if (!lt?.tiles?.length) return null
      if (tileCanvasCache.current.has(lt)) return tileCanvasCache.current.get(lt)
      const cs = lt.tiles.map(td => {
        if (!td) return null
        const c = document.createElement('canvas')
        const ts = lt.tileSize || tileSize
        c.width = ts; c.height = ts
        c.getContext('2d').putImageData(td, 0, 0)
        return c
      })
      tileCanvasCache.current.set(lt, cs)
      return cs
    })
  ), [layerTiles, tileSize])

  const assetCanvases = useMemo(() => {
    const cache = {}
    const ids = new Set(placedProps.map(p => p.assetId))
    if (selectedAssetId != null) ids.add(selectedAssetId)
    for (const id of ids) {
      const a = assetsById[id]
      if (!a) continue
      const cacheKey = `${a.id}:${a.cols}:${a.rows}:${a.tileSize}:${a.pixels?.byteLength || a.pixels?.length || 0}`
      const cached = assetCanvasCache.current.get(cacheKey)
      if (cached) {
        cache[id] = cached
        continue
      }
      const entry = { canvas: assetToCanvas(a), cols: a.cols, rows: a.rows }
      assetCanvasCache.current.set(cacheKey, entry)
      cache[id] = entry
    }
    return cache
  }, [placedProps, assetsById, selectedAssetId])

  const renderedLayerCanvases = useMemo(() => (
    layers.map((layer, li) => {
      const tiles = layerTiles[li]
      const tcs = layerTileCanvases[li]
      const lim = layerIndexMaps[li]
      if (!tiles?.tiles?.length || !tcs || !lim) return null

      const cacheKey = `${width}x${height}:${tileSize}:${tiles.tileSize || tileSize}:${seamlessEdges ? 1 : 0}`
      const cached = layerRenderCache.current.get(layer.id)
      const canReuse = cached
        && cached.grid === layer.grid
        && cached.manualTiles === layer.manualTiles
        && cached.tilesRef === tiles
        && cached.cacheKey === cacheKey

      if (canReuse) return cached.canvas

      const canvas = cached?.canvas || document.createElement('canvas')
      canvas.width = width * tileSize
      canvas.height = height * tileSize
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.imageSmoothingEnabled = false

      const ltSz = tiles.tileSize || tileSize
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const cell = y * width + x
          const manualIdx = layer.manualTiles[cell]
          const idx = manualIdx >= 0 ? manualIdx : (lim[cell] ?? 0)
          if (!idx) continue
          const tc = tcs[idx]
          if (!tc) continue
          ctx.drawImage(tc, 0, 0, ltSz, ltSz, x * tileSize, y * tileSize, tileSize, tileSize)
        }
      }

      layerRenderCache.current.set(layer.id, {
        canvas,
        grid: layer.grid,
        manualTiles: layer.manualTiles,
        tilesRef: tiles,
        cacheKey,
      })
      return canvas
    })
  ), [layers, layerTiles, layerTileCanvases, layerIndexMaps, width, height, tileSize, seamlessEdges])

  // Compose cached layer canvases bottom to top, then props.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = '#0c0c18'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    for (let li = 0; li < layers.length; li++) {
      const layer = layers[li]
      if (!layer.visible) continue
      const layerCanvas = renderedLayerCanvases[li]
      if (!layerCanvas) continue
      ctx.drawImage(layerCanvas, 0, 0)
    }

    for (const p of placedProps) {
      const entry = assetCanvases[p.assetId]
      if (!entry) continue
      ctx.drawImage(entry.canvas, 0, 0, entry.canvas.width, entry.canvas.height,
        p.x * tileSize, p.y * tileSize, entry.cols * tileSize, entry.rows * tileSize)
    }
  }, [layers, renderedLayerCanvases, assetCanvases, placedProps, width, height, tileSize])

  const drawOverlay = useCallback(() => {
    const canvas = gridRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dW = width * cellPx, dH = height * cellPx
    if (canvas.width !== dW || canvas.height !== dH) { canvas.width = dW; canvas.height = dH }
    ctx.clearRect(0, 0, dW, dH)

    if (showGrid) {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx.lineWidth = 1
      for (let x = 0; x <= width; x++) { ctx.beginPath(); ctx.moveTo(x * cellPx, 0); ctx.lineTo(x * cellPx, dH); ctx.stroke() }
      for (let y = 0; y <= height; y++) { ctx.beginPath(); ctx.moveTo(0, y * cellPx); ctx.lineTo(dW, y * cellPx); ctx.stroke() }
    }

    if (levelTool === 'props' && hoverCell.current && selectedAssetId != null) {
      const entry = assetCanvases[selectedAssetId]
      if (entry) {
        const [hx, hy] = hoverCell.current
        ctx.imageSmoothingEnabled = false
        ctx.globalAlpha = 0.55
        ctx.drawImage(entry.canvas, 0, 0, entry.canvas.width, entry.canvas.height,
          hx * cellPx, hy * cellPx, entry.cols * cellPx, entry.rows * cellPx)
        ctx.globalAlpha = 1
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'
        ctx.lineWidth = 1
        ctx.strokeRect(hx * cellPx + 0.5, hy * cellPx + 0.5, entry.cols * cellPx - 1, entry.rows * cellPx - 1)
      }
    }

    if (levelTool === 'terrain' && terrainTool === 'rect' && rectDrag.current?.cur) {
      const { start, cur } = rectDrag.current
      const x0 = Math.min(start[0], cur[0]), y0 = Math.min(start[1], cur[1])
      const x1 = Math.max(start[0], cur[0]), y1 = Math.max(start[1], cur[1])
      ctx.strokeStyle = 'rgba(47,214,166,0.95)'
      ctx.lineWidth = 2
      ctx.strokeRect(x0 * cellPx + 1, y0 * cellPx + 1, (x1 - x0 + 1) * cellPx - 2, (y1 - y0 + 1) * cellPx - 2)
    }
  }, [width, height, cellPx, showGrid, levelTool, selectedAssetId, assetCanvases, terrainTool])

  useEffect(() => { drawOverlay() }, [drawOverlay])

  useEffect(() => {
    const el = canvasRef.current
    if (!el || !setCellPx) return
    const onWheel = (e) => {
      e.preventDefault()
      const dir = e.deltaY < 0 ? 1 : -1
      const newCell = Math.max(MIN_CELL_PX, Math.min(MAX_CELL_PX, cellPx + dir * ZOOM_STEP))
      if (newCell === cellPx) return
      const rect = el.getBoundingClientRect()
      zoomAnchor.current = {
        worldX: (e.clientX - rect.left) / cellPx, worldY: (e.clientY - rect.top) / cellPx,
        clientX: e.clientX, clientY: e.clientY,
      }
      setCellPx(newCell)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [cellPx, setCellPx])

  useLayoutEffect(() => {
    const anchor = zoomAnchor.current
    if (!anchor) return
    zoomAnchor.current = null
    const container = canvasRef.current?.closest('.level-canvas-area')
    if (!container) return
    const rect = canvasRef.current.getBoundingClientRect()
    container.scrollLeft += (rect.left + anchor.worldX * cellPx) - anchor.clientX
    container.scrollTop  += (rect.top  + anchor.worldY * cellPx) - anchor.clientY
  }, [cellPx])

  const cellFromEvent = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    return [Math.floor((e.clientX - rect.left) / cellPx), Math.floor((e.clientY - rect.top) / cellPx)]
  }, [cellPx])

  const handleDown = useCallback((e) => {
    e.preventDefault()
    const [x, y] = cellFromEvent(e)
    if (levelTool === 'props') {
      if (e.button === 2) onRemovePropAt?.(x, y); else onPlaceProp?.(x, y)
      return
    }
    if (terrainTool === 'picker') { onPickTerrain?.(x, y); return }
    if (terrainTool === 'fill')   { onFillTerrain?.(x, y, e.button === 2); return }
    if (terrainTool === 'rect')   { rectDrag.current = { start: [x, y], cur: [x, y], erase: e.button === 2 }; drawOverlay(); return }
    painting.current = true
    lastPaintCell.current = [x, y]
    onStartPaint(x, y, e.button === 2, terrainBrushSize)
  }, [levelTool, terrainTool, terrainBrushSize, cellFromEvent, onStartPaint, onPlaceProp, onRemovePropAt, onFillTerrain, onPickTerrain, drawOverlay])

  const handleMove = useCallback((e) => {
    const [x, y] = cellFromEvent(e)
    if (levelTool === 'props') { hoverCell.current = [x, y]; drawOverlay(); return }
    if (terrainTool === 'rect' && rectDrag.current) { rectDrag.current.cur = [x, y]; drawOverlay(); return }
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
  }, [levelTool, terrainTool, terrainBrushSize, cellFromEvent, onContinuePaint, drawOverlay, forEachCellOnLine])

  const handleUp = useCallback(() => {
    if (rectDrag.current) {
      const { start, cur, erase } = rectDrag.current
      if (cur && onRectTerrain) onRectTerrain({ x: start[0], y: start[1] }, { x: cur[0], y: cur[1] }, erase)
      rectDrag.current = null; drawOverlay()
    }
    painting.current = false
    lastPaintCell.current = null
    onEndPaint?.()
  }, [onEndPaint, onRectTerrain, drawOverlay])

  const handleLeave = useCallback(() => {
    painting.current = false; rectDrag.current = null; lastPaintCell.current = null
    if (hoverCell.current) { hoverCell.current = null; drawOverlay() }
  }, [drawOverlay])

  const displayW = width * cellPx, displayH = height * cellPx
  const cursor = levelTool === 'props' ? (selectedAssetId != null ? 'copy' : 'not-allowed') : 'crosshair'

  return (
    <div className="level-canvas-wrapper" style={{ position: 'relative', width: displayW, height: displayH }}>
      <canvas ref={canvasRef}
        width={width * tileSize} height={height * tileSize}
        style={{ width: displayW, height: displayH, imageRendering: 'pixelated', display: 'block', cursor }}
        onMouseDown={handleDown} onMouseMove={handleMove} onMouseUp={handleUp}
        onMouseLeave={handleLeave} onContextMenu={e => e.preventDefault()}
      />
      <canvas ref={gridRef}
        style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', width: displayW, height: displayH }}
      />
    </div>
  )
}

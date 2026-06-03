import { useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react'
import { computeIndexMap } from '../../core/autotile.js'
import { MIN_CELL_PX, MAX_CELL_PX, ZOOM_STEP } from './zoomConfig.js'

// Builds an offscreen canvas from an asset's pixel buffer.
function assetToCanvas(asset) {
  const pxW = asset.cols * asset.tileSize
  const pxH = asset.rows * asset.tileSize
  const c = document.createElement('canvas')
  c.width = pxW
  c.height = pxH
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(asset.pixels), pxW, pxH), 0, 0)
  return c
}

// Renders the level grid by autotiling it with the active tileset, plus any
// placed props on top. Supports two tools: 'terrain' (paint cells) and 'props'
// (place/remove props from the gallery).
export function LevelCanvas({
  grid, width, height, tiles, tileSize, cellPx, setCellPx, seamlessEdges, showGrid, manualTiles = null,
  onStartPaint, onContinuePaint, onEndPaint,
  terrainTool = 'brush', terrainBrushSize = 1, onFillTerrain, onRectTerrain, onPickTerrain,
  levelTool = 'terrain', placedProps = [], assetsById = {}, selectedAssetId = null,
  onPlaceProp, onRemovePropAt,
}) {
  const canvasRef = useRef(null)
  const gridRef   = useRef(null)
  const painting  = useRef(false)
  const hoverCell = useRef(null)        // [x,y] under cursor (for the props ghost)
  const zoomAnchor = useRef(null)
  const rectDrag = useRef(null)

  // Pre-render each tile to its own small canvas for fast drawImage blits
  const tileCanvases = useMemo(() => {
    if (!tiles) return null
    return tiles.map(td => {
      if (!td) return null
      const c = document.createElement('canvas')
      c.width = tileSize
      c.height = tileSize
      c.getContext('2d').putImageData(td, 0, 0)
      return c
    })
  }, [tiles, tileSize])

  // Cache an offscreen canvas per asset that is placed or selected
  const assetCanvases = useMemo(() => {
    const cache = {}
    const ids = new Set(placedProps.map(p => p.assetId))
    if (selectedAssetId != null) ids.add(selectedAssetId)
    for (const id of ids) {
      const a = assetsById[id]
      if (a) cache[id] = { canvas: assetToCanvas(a), cols: a.cols, rows: a.rows }
    }
    return cache
  }, [placedProps, assetsById, selectedAssetId])

  const indexMap = useMemo(
    () => computeIndexMap(grid, width, height, seamlessEdges ? 1 : 0),
    [grid, width, height, seamlessEdges]
  )

  // Draw the autotiled level + placed props
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = false

    ctx.fillStyle = '#0c0c18'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    if (tileCanvases) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const manualIdx = manualTiles ? manualTiles[y * width + x] : -1
          const idx = manualIdx >= 0 ? manualIdx : indexMap[y * width + x]
          if (idx === 0) continue
          const tc = tileCanvases[idx]
          if (!tc) continue
          ctx.drawImage(tc, 0, 0, tileSize, tileSize, x * tileSize, y * tileSize, tileSize, tileSize)
        }
      }
    }

    // Props on top (anchor = top-left cell), scaled to occupy cols×rows cells
    for (const p of placedProps) {
      const entry = assetCanvases[p.assetId]
      if (!entry) continue
      ctx.drawImage(
        entry.canvas, 0, 0, entry.canvas.width, entry.canvas.height,
        p.x * tileSize, p.y * tileSize, entry.cols * tileSize, entry.rows * tileSize
      )
    }
  }, [indexMap, manualTiles, tileCanvases, assetCanvases, placedProps, width, height, tileSize])

  // Overlay = grid lines + props ghost under the cursor. Drawn imperatively so
  // the ghost can follow the mouse without re-rendering React.
  const drawOverlay = useCallback(() => {
    const canvas = gridRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dW = width * cellPx
    const dH = height * cellPx
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
        ctx.drawImage(
          entry.canvas, 0, 0, entry.canvas.width, entry.canvas.height,
          hx * cellPx, hy * cellPx, entry.cols * cellPx, entry.rows * cellPx
        )
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
  }, [width, height, cellPx, showGrid, levelTool, selectedAssetId, assetCanvases, terrainTool])

  useEffect(() => { drawOverlay() }, [drawOverlay])

  // Wheel zoom centered on the cursor.
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
        worldX: (e.clientX - rect.left) / cellPx,
        worldY: (e.clientY - rect.top)  / cellPx,
        clientX: e.clientX,
        clientY: e.clientY,
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
    const x = Math.floor((e.clientX - rect.left) / cellPx)
    const y = Math.floor((e.clientY - rect.top)  / cellPx)
    return [x, y]
  }, [cellPx])

  const handleDown = useCallback((e) => {
    e.preventDefault()
    const [x, y] = cellFromEvent(e)
    if (levelTool === 'props') {
      if (e.button === 2) onRemovePropAt && onRemovePropAt(x, y)
      else onPlaceProp && onPlaceProp(x, y)
      return
    }
    if (terrainTool === 'picker') {
      onPickTerrain && onPickTerrain(x, y)
      return
    }
    if (terrainTool === 'fill') {
      onFillTerrain && onFillTerrain(x, y, e.button === 2)
      return
    }
    if (terrainTool === 'rect') {
      rectDrag.current = { start: [x, y], cur: [x, y], erase: e.button === 2 }
      drawOverlay()
      return
    }
    painting.current = true
    onStartPaint(x, y, e.button === 2, terrainBrushSize)
  }, [levelTool, terrainTool, terrainBrushSize, cellFromEvent, onStartPaint, onPlaceProp, onRemovePropAt, onFillTerrain, onPickTerrain, drawOverlay])

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
    onContinuePaint(x, y, terrainBrushSize)
  }, [levelTool, terrainTool, terrainBrushSize, cellFromEvent, onContinuePaint, drawOverlay])

  const handleUp = useCallback(() => {
    if (rectDrag.current) {
      const { start, cur, erase } = rectDrag.current
      if (cur && onRectTerrain) {
        onRectTerrain({ x: start[0], y: start[1] }, { x: cur[0], y: cur[1] }, erase)
      }
      rectDrag.current = null
      drawOverlay()
    }
    painting.current = false
    onEndPaint && onEndPaint()
  }, [onEndPaint, onRectTerrain, drawOverlay])

  const handleLeave = useCallback(() => {
    painting.current = false
    rectDrag.current = null
    if (hoverCell.current) { hoverCell.current = null; drawOverlay() }
  }, [drawOverlay])

  const displayW = width * cellPx
  const displayH = height * cellPx
  const cursor = levelTool === 'props' ? (selectedAssetId != null ? 'copy' : 'not-allowed') : 'crosshair'

  return (
    <div className="level-canvas-wrapper" style={{ position: 'relative', width: displayW, height: displayH }}>
      <canvas
        ref={canvasRef}
        width={width * tileSize}
        height={height * tileSize}
        style={{ width: displayW, height: displayH, imageRendering: 'pixelated', display: 'block', cursor }}
        onMouseDown={handleDown}
        onMouseMove={handleMove}
        onMouseUp={handleUp}
        onMouseLeave={handleLeave}
        onContextMenu={(e) => e.preventDefault()}
      />
      <canvas
        ref={gridRef}
        style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', width: displayW, height: displayH }}
      />
    </div>
  )
}

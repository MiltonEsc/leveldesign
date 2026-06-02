import { useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react'
import { computeIndexMap } from '../../core/autotile.js'
import { MIN_CELL_PX, MAX_CELL_PX, ZOOM_STEP } from './zoomConfig.js'

// Renders the level grid by autotiling it with the active tileset.
export function LevelCanvas({
  grid, width, height, tiles, tileSize, cellPx, setCellPx, seamlessEdges,
  showGrid, onStartPaint, onContinuePaint, onEndPaint,
}) {
  const canvasRef = useRef(null)
  const gridRef   = useRef(null)
  const painting  = useRef(false)
  const zoomAnchor = useRef(null) // pending cursor-centered zoom adjustment

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

  const indexMap = useMemo(
    () => computeIndexMap(grid, width, height, seamlessEdges ? 1 : 0),
    [grid, width, height, seamlessEdges]
  )

  // Draw the autotiled level
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = false

    // Background
    ctx.fillStyle = '#0c0c18'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    if (!tileCanvases) return
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = indexMap[y * width + x]
        if (idx === 0) continue // empty cell → background
        const tc = tileCanvases[idx]
        if (!tc) continue
        ctx.drawImage(tc, 0, 0, tileSize, tileSize, x * tileSize, y * tileSize, tileSize, tileSize)
      }
    }
  }, [indexMap, tileCanvases, width, height, tileSize])

  // Grid overlay
  useEffect(() => {
    const canvas = gridRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dW = width * cellPx
    const dH = height * cellPx
    canvas.width = dW
    canvas.height = dH
    ctx.clearRect(0, 0, dW, dH)
    if (!showGrid) return
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 1
    for (let x = 0; x <= width; x++) {
      ctx.beginPath(); ctx.moveTo(x * cellPx, 0); ctx.lineTo(x * cellPx, dH); ctx.stroke()
    }
    for (let y = 0; y <= height; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * cellPx); ctx.lineTo(dW, y * cellPx); ctx.stroke()
    }
  }, [width, height, cellPx, showGrid])

  // Wheel zoom centered on the cursor. Uses a native non-passive listener so
  // preventDefault() actually stops the page/container from scrolling.
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

  // After a wheel-zoom re-render, scroll so the same world point stays under the cursor.
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
    painting.current = true
    const [x, y] = cellFromEvent(e)
    onStartPaint(x, y, e.button === 2) // right-click erases
  }, [cellFromEvent, onStartPaint])

  const handleMove = useCallback((e) => {
    if (!painting.current) return
    const [x, y] = cellFromEvent(e)
    onContinuePaint(x, y)
  }, [cellFromEvent, onContinuePaint])

  const handleUp = useCallback(() => {
    painting.current = false
    onEndPaint && onEndPaint()
  }, [onEndPaint])

  const displayW = width * cellPx
  const displayH = height * cellPx

  return (
    <div className="level-canvas-wrapper" style={{ position: 'relative', width: displayW, height: displayH }}>
      <canvas
        ref={canvasRef}
        width={width * tileSize}
        height={height * tileSize}
        style={{ width: displayW, height: displayH, imageRendering: 'pixelated', display: 'block', cursor: 'crosshair' }}
        onMouseDown={handleDown}
        onMouseMove={handleMove}
        onMouseUp={handleUp}
        onMouseLeave={handleUp}
        onContextMenu={(e) => e.preventDefault()}
      />
      <canvas
        ref={gridRef}
        style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', width: displayW, height: displayH }}
      />
    </div>
  )
}

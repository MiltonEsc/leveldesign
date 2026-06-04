import { useRef, useEffect, useCallback } from 'react'

// Pixel editor canvas for non-square props. A CSS checkerboard sits behind the
// drawing canvas so transparent pixels are visible. Right-click always erases.
export function AssetCanvas({
  pixels, width, height, zoom,
  onStartStroke, onContinueStroke, onEndStroke,
  onStartErase, onContinueErase,
  onZoomChange,
}) {
  const canvasRef = useRef(null)
  const gridRef   = useRef(null)
  const erasingRef = useRef(false)

  // Render pixels
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, width, height)
    const imageData = new ImageData(new Uint8ClampedArray(pixels), width, height)
    ctx.putImageData(imageData, 0, 0)
  }, [pixels, width, height])

  // Grid overlay
  useEffect(() => {
    const canvas = gridRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dW = width * zoom
    const dH = height * zoom
    canvas.width  = dW
    canvas.height = dH
    ctx.clearRect(0, 0, dW, dH)
    if (zoom >= 4) {
      ctx.strokeStyle = 'rgba(255,255,255,0.10)'
      ctx.lineWidth = 0.5
      for (let x = 0; x <= width; x++) {
        ctx.beginPath(); ctx.moveTo(x * zoom, 0); ctx.lineTo(x * zoom, dH); ctx.stroke()
      }
      for (let y = 0; y <= height; y++) {
        ctx.beginPath(); ctx.moveTo(0, y * zoom); ctx.lineTo(dW, y * zoom); ctx.stroke()
      }
    }
  }, [width, height, zoom])

  const getPixelCoords = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const x = Math.floor((e.clientX - rect.left) / zoom)
    const y = Math.floor((e.clientY - rect.top)  / zoom)
    return [x, y]
  }, [zoom])

  const handleMouseDown = useCallback((e) => {
    e.preventDefault()
    const [x, y] = getPixelCoords(e)
    if (e.button === 2) {
      erasingRef.current = true
      onStartErase?.(x, y)
    } else {
      erasingRef.current = false
      onStartStroke(x, y)
    }
  }, [getPixelCoords, onStartStroke, onStartErase])

  const handleMouseMove = useCallback((e) => {
    if (e.buttons === 0) return
    const [x, y] = getPixelCoords(e)
    if (erasingRef.current) {
      onContinueErase?.(x, y)
    } else if (e.buttons === 1) {
      onContinueStroke(x, y)
    }
  }, [getPixelCoords, onContinueStroke, onContinueErase])

  const handleMouseUp = useCallback(() => {
    erasingRef.current = false
    onEndStroke()
  }, [onEndStroke])

  const handleWheel = useCallback((e) => {
    e.preventDefault()
    onZoomChange?.(e.deltaY < 0 ? 1 : -1)
  }, [onZoomChange])

  const dW = width * zoom
  const dH = height * zoom

  return (
    <div
      className="asset-canvas-wrapper checker-bg"
      style={{ position: 'relative', width: dW, height: dH }}
      onContextMenu={e => e.preventDefault()}
    >
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ width: dW, height: dH, imageRendering: 'pixelated', cursor: 'crosshair', display: 'block' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />
      <canvas
        ref={gridRef}
        style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', width: dW, height: dH }}
      />
    </div>
  )
}

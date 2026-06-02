import { useEffect, useRef } from 'react'

// Shows first 12 tiles (4 columns × 3 rows) of a biome as a mini preview
export function BiomeCardPreview({ tiles, tileSize }) {
  const canvasRef = useRef(null)
  const COLS = 4
  const ROWS = 3
  // Fixed on-screen cell size so cards stay the same size for any tile size
  const cellSize = 18

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !tiles) return
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    for (let i = 0; i < COLS * ROWS; i++) {
      const tile = tiles[i + 1] // skip empty tile at 0
      if (!tile) continue
      const col = i % COLS
      const row = Math.floor(i / COLS)
      const tmp = document.createElement('canvas')
      tmp.width  = tileSize
      tmp.height = tileSize
      tmp.getContext('2d').putImageData(tile, 0, 0)
      ctx.drawImage(tmp, col * cellSize, row * cellSize, cellSize, cellSize)
    }
  }, [tiles, tileSize, cellSize])

  return (
    <canvas
      ref={canvasRef}
      width={COLS * cellSize}
      height={ROWS * cellSize}
      className="biome-card-preview"
      style={{ imageRendering: 'pixelated' }}
    />
  )
}

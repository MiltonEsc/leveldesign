import { useRef, useEffect } from 'react'

// Compact minimap. `getIndex(x,y)` returns a tile sheet index (>=0) or -1/empty.
// Draws each filled cell as a few pixels sampled from the native sheet.
export function Minimap({ width, height, getIndex, nativeSheet, tileSize, mp = 4 }) {
  const ref = useRef(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    cv.width = width * mp
    cv.height = height * mp
    const ctx = cv.getContext('2d')
    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = '#0a0d12'
    ctx.fillRect(0, 0, cv.width, cv.height)
    if (!nativeSheet) return
    const cols = 8
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = getIndex(x, y)
        if (idx == null || idx < 0 || idx === 0) continue
        const sx = (idx % cols) * tileSize
        const sy = Math.floor(idx / cols) * tileSize
        ctx.drawImage(nativeSheet, sx, sy, tileSize, tileSize, x * mp, y * mp, mp, mp)
      }
    }
  }, [width, height, getIndex, nativeSheet, tileSize, mp])
  return <canvas ref={ref} className="mini-canvas" />
}

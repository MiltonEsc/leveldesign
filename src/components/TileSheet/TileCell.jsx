import { useEffect, useRef } from 'react'
import { INDEX_TO_BITMASK, INDEX_TO_CATEGORY } from '../../constants/bitmaskTable.js'

export function TileCell({ tile, index, tileSize }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !tile) return
    canvas.getContext('2d').putImageData(tile, 0, 0)
  }, [tile])

  const bitmask = INDEX_TO_BITMASK[index]
  const category = INDEX_TO_CATEGORY[index]

  // Cells fill an equal fraction of the grid width (set by the panel), so the
  // 48-tile sheet always fits regardless of native tile size (8/16/32/64).
  return (
    <div
      className="tile-cell"
      title={`#${index} | ${category}\nBitmask: 0x${bitmask.toString(16).toUpperCase().padStart(2,'0')} (${bitmask.toString(2).padStart(8,'0')})`}
      style={{ aspectRatio: '1 / 1' }}
    >
      {tile ? (
        <canvas
          ref={canvasRef}
          width={tileSize}
          height={tileSize}
          style={{ width: '100%', height: '100%', imageRendering: 'pixelated', display: 'block' }}
        />
      ) : (
        <div className="tile-cell-empty" style={{ width: '100%', height: '100%' }} />
      )}
      <span className="tile-index">{index}</span>
    </div>
  )
}

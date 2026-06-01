import { useEffect, useRef } from 'react'
import { INDEX_TO_BITMASK, INDEX_TO_CATEGORY } from '../../constants/bitmaskTable.js'

const PREVIEW_ZOOM = 4

export function TileCell({ tile, index, tileSize }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !tile) return
    canvas.getContext('2d').putImageData(tile, 0, 0)
  }, [tile])

  const bitmask = INDEX_TO_BITMASK[index]
  const category = INDEX_TO_CATEGORY[index]
  const displaySize = tileSize * PREVIEW_ZOOM

  return (
    <div
      className="tile-cell"
      title={`#${index} | ${category}\nBitmask: 0x${bitmask.toString(16).toUpperCase().padStart(2,'0')} (${bitmask.toString(2).padStart(8,'0')})`}
      style={{ width: displaySize, height: displaySize }}
    >
      {tile ? (
        <canvas
          ref={canvasRef}
          width={tileSize}
          height={tileSize}
          style={{ width: displaySize, height: displaySize, imageRendering: 'pixelated' }}
        />
      ) : (
        <div className="tile-cell-empty" style={{ width: displaySize, height: displaySize }} />
      )}
      <span className="tile-index">{index}</span>
    </div>
  )
}

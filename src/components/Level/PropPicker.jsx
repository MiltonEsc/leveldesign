import { useRef, useEffect } from 'react'

// Thumbnail of a prop (transparent-aware) for the picker.
function PropThumb({ asset, size = 48 }) {
  const ref = useRef(null)
  const pxW = asset.cols * asset.tileSize
  const pxH = asset.rows * asset.tileSize

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, size, size)
    const scale = Math.min(size / pxW, size / pxH)
    const dW = pxW * scale
    const dH = pxH * scale
    const tmp = document.createElement('canvas')
    tmp.width = pxW; tmp.height = pxH
    tmp.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(asset.pixels), pxW, pxH), 0, 0)
    ctx.drawImage(tmp, (size - dW) / 2, (size - dH) / 2, dW, dH)
  }, [asset, pxW, pxH, size])

  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      className="checker-bg"
      style={{ width: size, height: size, imageRendering: 'pixelated', borderRadius: 4 }}
    />
  )
}

// Lets the user pick which saved prop to place on the level, and clear placed props.
export function PropPicker({ assets, selectedId, onSelect, placedCount, onClearProps }) {
  return (
    <div className="prop-picker">
      <div className="prop-picker-head">
        <span className="level-section-label">🧩 Props ({placedCount} placed)</span>
        <button
          className="level-mini-btn"
          onClick={onClearProps}
          disabled={!placedCount}
          title="Remove all placed props"
        >
          🧹 Clear
        </button>
      </div>

      {assets.length === 0 ? (
        <div className="prop-picker-empty">No props yet. Create one in the Assets view, then come back to place it.</div>
      ) : (
        <>
          <div className="prop-picker-grid">
            {assets.map(a => (
              <button
                key={a.id}
                className={`prop-pick-card ${selectedId === a.id ? 'selected' : ''}`}
                onClick={() => onSelect(a.id)}
                title={`${a.name} · ${a.cols}×${a.rows}`}
              >
                <PropThumb asset={a} />
                <span className="prop-pick-name">{a.name}</span>
              </button>
            ))}
          </div>
          <div className="level-hint">Click the canvas to place · right-click a prop to remove</div>
        </>
      )}
    </div>
  )
}

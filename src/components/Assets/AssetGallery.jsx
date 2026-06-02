import { useRef, useEffect } from 'react'

// Renders one prop's pixels into a small canvas thumbnail.
function AssetThumb({ asset, size = 56 }) {
  const ref = useRef(null)
  const pxW = asset.cols * asset.tileSize
  const pxH = asset.rows * asset.tileSize

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, size, size)
    // Fit the prop into the square thumb, keeping aspect ratio
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

export function AssetGallery({
  assets, selectedId, onSelect, onRemove, onExport, onLoadToEditor, onExportAll,
}) {
  return (
    <div className="asset-gallery">
      <div className="asset-gallery-head">
        <span className="asset-gallery-title">Gallery ({assets.length})</span>
        <button
          className="asset-mini-btn"
          onClick={onExportAll}
          disabled={!assets.length}
          title="Export all props as one atlas PNG"
        >
          ⬇ Atlas
        </button>
      </div>

      {assets.length === 0 ? (
        <div className="asset-gallery-empty">No props yet. Generate or draw one, then “Save to gallery”.</div>
      ) : (
        <div className="asset-gallery-grid">
          {assets.map(a => (
            <div
              key={a.id}
              className={`asset-card ${selectedId === a.id ? 'selected' : ''}`}
              onClick={() => onSelect(a.id)}
              title={`${a.name} · ${a.cols}×${a.rows}`}
            >
              <AssetThumb asset={a} />
              <div className="asset-card-name">{a.name}</div>
              <div className="asset-card-actions">
                <button className="asset-card-btn" onClick={(e) => { e.stopPropagation(); onLoadToEditor(a) }} title="Edit in canvas">✏️</button>
                <button className="asset-card-btn" onClick={(e) => { e.stopPropagation(); onExport(a) }} title="Export PNG">⬇</button>
                <button className="asset-card-btn danger" onClick={(e) => { e.stopPropagation(); onRemove(a.id) }} title="Delete">🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

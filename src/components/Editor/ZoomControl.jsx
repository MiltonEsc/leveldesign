export function ZoomControl({ zoom, setZoom, tileSize }) {
  const min = tileSize >= 64 ? 2 : 4
  const max = tileSize === 8 ? 32 : tileSize === 16 ? 20 : 12

  return (
    <div className="sidebar-card zoom-card">
      <div className="sidebar-inline-label">
        <span className="brush-label">Zoom</span>
        <span className="brush-value">{zoom}x</span>
      </div>
      <div className="zoom-control modern-zoom-control">
        <button
          className="zoom-btn modern-zoom-btn"
          onClick={() => setZoom(z => Math.max(min, z - 2))}
          disabled={zoom <= min}
          title="Zoom out"
        >
          Zoom out
        </button>
        <button
          className="zoom-btn modern-zoom-btn"
          onClick={() => setZoom(z => Math.min(max, z + 2))}
          disabled={zoom >= max}
          title="Zoom in"
        >
          Zoom in
        </button>
      </div>
    </div>
  )
}

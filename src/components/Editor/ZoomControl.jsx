export function ZoomControl({ zoom, setZoom, tileSize }) {
  const min = tileSize >= 64 ? 2 : 4
  const max = tileSize === 8 ? 32 : tileSize === 16 ? 20 : 12

  return (
    <div className="zoom-control">
      <button
        className="zoom-btn"
        onClick={() => setZoom(z => Math.max(min, z - 2))}
        disabled={zoom <= min}
      >−</button>
      <span className="zoom-label">{zoom}×</span>
      <button
        className="zoom-btn"
        onClick={() => setZoom(z => Math.min(max, z + 2))}
        disabled={zoom >= max}
      >+</button>
    </div>
  )
}

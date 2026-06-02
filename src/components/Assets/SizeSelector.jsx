const OPTIONS = [1, 2, 3, 4]

// Picks prop size in cells (cols × rows), 1..4 each.
export function SizeSelector({ cols, rows, onChange, tileSize }) {
  return (
    <div className="size-selector">
      <div className="size-selector-label">Prop size (cells)</div>
      <div className="size-selector-row">
        <div className="size-selector-group">
          <span className="size-selector-axis">W</span>
          {OPTIONS.map(n => (
            <button
              key={n}
              className={`size-cell-btn ${cols === n ? 'active' : ''}`}
              onClick={() => onChange(n, rows)}
            >
              {n}
            </button>
          ))}
        </div>
        <span className="size-selector-x">×</span>
        <div className="size-selector-group">
          <span className="size-selector-axis">H</span>
          {OPTIONS.map(n => (
            <button
              key={n}
              className={`size-cell-btn ${rows === n ? 'active' : ''}`}
              onClick={() => onChange(cols, n)}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <div className="size-selector-info">{cols * tileSize} × {rows * tileSize} px</div>
    </div>
  )
}

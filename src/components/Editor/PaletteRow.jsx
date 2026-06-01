const DEFAULT_COLORS = [
  '#000000','#ffffff','#ff0000','#00ff00','#0000ff',
  '#ffff00','#ff8800','#ff00ff','#00ffff','#888888',
  '#4a7c2f','#d4a843','#dce8f0','#3d3540','#2a5f8f',
  '#c43a00','#5a9b3a','#5a5050','#8b3a3a','#3a3a8b',
]

export function PaletteRow({ activeColor, setActiveColor }) {
  return (
    <div className="palette-section">
      <div className="palette-label">Color</div>
      <div className="palette-row">
        {DEFAULT_COLORS.map(c => (
          <button
            key={c}
            className={`swatch ${activeColor === c ? 'active' : ''}`}
            style={{ background: c }}
            title={c}
            onClick={() => setActiveColor(c)}
          />
        ))}
      </div>
      <div className="color-input-row">
        <div
          className="active-color-preview"
          style={{ background: activeColor }}
        />
        <input
          type="color"
          value={activeColor}
          onChange={e => setActiveColor(e.target.value)}
          title="Custom color"
          className="color-input"
        />
      </div>
    </div>
  )
}

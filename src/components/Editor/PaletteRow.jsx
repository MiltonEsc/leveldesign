const DEFAULT_COLORS = [
  '#fb7185', '#f43f5e', '#fb923c', '#facc15', '#4ade80', '#34d399',
  '#22d3ee', '#60a5fa', '#a78bfa', '#a8a29e', '#57534e', '#f1f5f9',
]

export function PaletteRow({ activeColor, setActiveColor }) {
  return (
    <div className="sidebar-card palette-card">
      <div className="sidebar-card-title">Color palette</div>
      <div className="palette-row">
        {DEFAULT_COLORS.map((c) => (
          <button
            key={c}
            className={`swatch ${activeColor === c ? 'active' : ''}`}
            style={{ background: c }}
            title={c}
            onClick={() => setActiveColor(c)}
          />
        ))}
      </div>
      <div className="color-input-row modern-color-row">
        <div className="active-color-preview-shell">
          <div
            className="active-color-preview"
            style={{ background: activeColor }}
          />
        </div>
        <input
          type="color"
          value={activeColor}
          onChange={e => setActiveColor(e.target.value)}
          title="Custom color"
          className="color-input modern-color-input"
        />
        <span className="active-color-code">{activeColor.toUpperCase()}</span>
      </div>
    </div>
  )
}

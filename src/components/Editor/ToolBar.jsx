const TOOLS = [
  { id: 'pencil', label: 'Pen', icon: '✎' },
  { id: 'eraser', label: 'Erase', icon: '⌫' },
  { id: 'fill', label: 'Fill', icon: '▣' },
  { id: 'line', label: 'Line', icon: '/' },
  { id: 'rect', label: 'Rect', icon: '□' },
  { id: 'rectFill', label: 'Rect fill', icon: '▦' },
  { id: 'eyedropper', label: 'Pick', icon: '◎' },
]

const BRUSH_MIN = 1
const BRUSH_MAX = 4

export function ToolBar({
  tool, setTool, brush, setBrush,
  onUndo, onRedo, canUndo, canRedo,
  onClear, clearLabel = 'Clear grid',
}) {
  return (
    <div className="sidebar-card toolbar toolbar-card">
      <div className="sidebar-card-title">Draw tools</div>

      <div className="tool-grid">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`tool-btn tool-icon-btn ${tool === t.id ? 'active' : ''}`}
            onClick={() => setTool(t.id)}
            title={t.label}
          >
            <span className="tool-icon-glyph" aria-hidden="true">{t.icon}</span>
          </button>
        ))}
      </div>

      <div className="sidebar-subsection">
        <div className="sidebar-inline-label">
          <span className="brush-label">Brush size</span>
          <span className="brush-value">{brush}px</span>
        </div>
        <input
          className="brush-slider"
          type="range"
          min={BRUSH_MIN}
          max={BRUSH_MAX}
          step="1"
          value={brush}
          onChange={(e) => setBrush(Number(e.target.value))}
        />
      </div>

      <div className="undo-row">
        <button className="undo-btn" onClick={onUndo} disabled={!canUndo}>Undo</button>
        <button className="undo-btn" onClick={onRedo} disabled={!canRedo}>Redo</button>
      </div>

      {onClear && (
        <button className="toolbar-clear-btn" onClick={onClear}>
          {clearLabel}
        </button>
      )}
    </div>
  )
}

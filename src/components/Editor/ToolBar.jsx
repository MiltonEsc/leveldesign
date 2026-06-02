const TOOLS = [
  { id: 'pencil',     label: 'Pen' },
  { id: 'eraser',     label: 'Erase' },
  { id: 'fill',       label: 'Fill' },
  { id: 'line',       label: 'Line' },
  { id: 'rect',       label: 'Rect' },
  { id: 'rectFill',   label: 'Rect fill' },
  { id: 'eyedropper', label: 'Pick' },
]

const BRUSH_SIZES = [1, 2, 3, 4]

export function ToolBar({ tool, setTool, brush, setBrush, onUndo, onRedo, canUndo, canRedo }) {
  return (
    <div className="toolbar">
      <div className="panel-label">Tools</div>
      <div className="tool-grid">
        {TOOLS.map(t => (
          <button
            key={t.id}
            className={`tool-btn ${tool === t.id ? 'active' : ''}`}
            onClick={() => setTool(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="brush-row">
        <span className="brush-label">Brush</span>
        {BRUSH_SIZES.map(s => (
          <button
            key={s}
            className={`brush-btn ${brush === s ? 'active' : ''}`}
            title={`${s}×${s} px`}
            onClick={() => setBrush(s)}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="undo-row">
        <button className="undo-btn" onClick={onUndo} disabled={!canUndo}>Undo</button>
        <button className="undo-btn" onClick={onRedo} disabled={!canRedo}>Redo</button>
      </div>
    </div>
  )
}

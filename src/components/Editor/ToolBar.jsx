const TOOLS = [
  { id: 'pencil',     label: '✏️', title: 'Pencil' },
  { id: 'eraser',     label: '⬜', title: 'Eraser' },
  { id: 'fill',       label: '🪣', title: 'Fill (flood)' },
  { id: 'line',       label: '📏', title: 'Line' },
  { id: 'rect',       label: '▭',  title: 'Rectangle (outline)' },
  { id: 'rectFill',   label: '▬',  title: 'Rectangle (filled)' },
  { id: 'eyedropper', label: '💧', title: 'Eyedropper (pick color)' },
]

const BRUSH_SIZES = [1, 2, 3, 4]

export function ToolBar({ tool, setTool, brush, setBrush, onUndo, onRedo, canUndo, canRedo }) {
  return (
    <div className="toolbar">
      <div className="toolbar-group">
        {TOOLS.map(t => (
          <button
            key={t.id}
            className={`tool-btn ${tool === t.id ? 'active' : ''}`}
            title={t.title}
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

      <div className="toolbar-group">
        <button className="tool-btn" title="Undo (Ctrl+Z)" onClick={onUndo} disabled={!canUndo}>↩</button>
        <button className="tool-btn" title="Redo (Ctrl+Y)" onClick={onRedo} disabled={!canRedo}>↪</button>
      </div>
    </div>
  )
}

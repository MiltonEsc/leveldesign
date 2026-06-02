import { GENERATORS } from '../../core/levelGenerator.js'
import { MIN_CELL_PX, MAX_CELL_PX, ZOOM_STEP } from './zoomConfig.js'

const SIZE_PRESETS = [
  { label: 'S',  w: 24, h: 16 },
  { label: 'M',  w: 32, h: 20 },
  { label: 'L',  w: 48, h: 28 },
  { label: 'XL', w: 64, h: 40 },
]

export function LevelControls({
  width, height, cellPx, setCellPx,
  showGrid, setShowGrid, seamlessEdges, setSeamlessEdges,
  onGenerate, onClear, onFill, onResize, onRandomizeAll, onFit,
}) {
  return (
    <div className="level-controls">
      <div className="level-section">
        <div className="level-section-label">⚡ Auto-Generate Level</div>
        <div className="gen-btn-grid">
          {Object.entries(GENERATORS).map(([key, g]) => (
            <button key={key} className="gen-btn" onClick={() => onGenerate(key)} title={`Generate ${g.label}`}>
              <span className="gen-btn-emoji">{g.emoji}</span>
              <span>{g.label}</span>
            </button>
          ))}
          <button className="gen-btn gen-btn-surprise" onClick={onRandomizeAll} title="Random generator + random seed">
            <span className="gen-btn-emoji">✨</span>
            <span>Surprise</span>
          </button>
        </div>
      </div>

      <div className="level-section">
        <div className="level-section-label">🖌️ Edit</div>
        <div className="level-edit-row">
          <button className="level-mini-btn" onClick={onClear} title="Clear the map">🧹 Clear</button>
          <button className="level-mini-btn" onClick={onFill} title="Fill the whole map">⬛ Fill</button>
        </div>
        <div className="level-hint">Left-click paints · Right-click erases</div>
      </div>

      <div className="level-section">
        <div className="level-section-label">📐 Map Size</div>
        <div className="size-preset-row">
          {SIZE_PRESETS.map(p => (
            <button
              key={p.label}
              className={`size-preset-btn ${width === p.w && height === p.h ? 'active' : ''}`}
              onClick={() => onResize(p.w, p.h)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="size-info">{width} × {height} tiles</div>
      </div>

      <div className="level-section">
        <div className="level-section-label">🔍 Zoom</div>
        <div className="zoom-control">
          <button className="zoom-btn" onClick={() => setCellPx(p => p - ZOOM_STEP)} disabled={cellPx <= MIN_CELL_PX}>−</button>
          <span className="zoom-label">{cellPx}px</span>
          <button className="zoom-btn" onClick={() => setCellPx(p => p + ZOOM_STEP)} disabled={cellPx >= MAX_CELL_PX}>+</button>
          <button className="zoom-fit-btn" onClick={onFit} title="Fit map to screen">⊡ Fit</button>
        </div>
        <div className="level-hint">Scroll wheel over the canvas to zoom</div>
      </div>

      <div className="level-section">
        <label className="level-checkbox">
          <input type="checkbox" checked={showGrid} onChange={e => setShowGrid(e.target.checked)} />
          Show grid
        </label>
        <label className="level-checkbox">
          <input type="checkbox" checked={seamlessEdges} onChange={e => setSeamlessEdges(e.target.checked)} />
          Seamless edges
        </label>
      </div>
    </div>
  )
}

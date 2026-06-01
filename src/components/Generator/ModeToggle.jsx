export function ModeToggle({ mode, setMode }) {
  return (
    <div className="mode-toggle">
      <button
        className={`mode-btn ${mode === 'draw' ? 'active' : ''}`}
        onClick={() => setMode('draw')}
      >
        ✏️ Draw
      </button>
      <button
        className={`mode-btn ${mode === 'procedural' ? 'active' : ''}`}
        onClick={() => setMode('procedural')}
      >
        ⚙️ Procedural
      </button>
    </div>
  )
}

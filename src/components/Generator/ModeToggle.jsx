export function ModeToggle({ mode, setMode }) {
  return (
    <div className="mode-toggle generator-panel">
      <button
        className={`mode-btn ${mode === 'draw' ? 'active' : ''}`}
        onClick={() => setMode('draw')}
      >
        Pixel Art
      </button>
      <button
        className={`mode-btn ${mode === 'procedural' ? 'active' : ''}`}
        onClick={() => setMode('procedural')}
      >
        Img to Pixel
      </button>
    </div>
  )
}

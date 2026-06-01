export function GenerateButton({ mode, onGenerate, disabled }) {
  return (
    <button
      className="generate-btn"
      onClick={onGenerate}
      disabled={disabled}
    >
      {mode === 'draw' ? '⚡ Generate Tileset' : '🎲 Generate Procedural'}
    </button>
  )
}

export function GenerateButton({ mode, onGenerate, disabled }) {
  return (
    <button
      className="generate-btn"
      onClick={onGenerate}
      disabled={disabled}
    >
      {mode === 'draw' ? 'Generate tileset' : 'Generate procedural'}
    </button>
  )
}

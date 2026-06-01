export function ProceduralControls({ biome, onColorChange }) {
  if (!biome) return null

  const colorKeys = ['primary', 'secondary', 'border', 'highlight', 'shadow']

  return (
    <div className="proc-controls">
      <div className="proc-label">Biome Colors</div>
      {colorKeys.map(key => (
        <div key={key} className="proc-color-row">
          <label className="proc-color-label">{key}</label>
          <input
            type="color"
            value={biome.colors[key]}
            onChange={e => onColorChange(key, e.target.value)}
            className="color-input"
          />
          <span className="proc-color-hex">{biome.colors[key]}</span>
        </div>
      ))}
    </div>
  )
}

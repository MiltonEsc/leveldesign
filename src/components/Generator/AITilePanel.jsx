import { useState } from 'react'
import { generateBaseTileWithAI } from '../../core/aiTile.js'
import { useAIModel } from '../../hooks/useAIModel.js'

const PROMPT_PRESETS = [
  'mossy stone floor with crisp pixel edges',
  'volcanic rock with glowing cracks, pixel art',
  'snowy ground with subtle icy texture, pixel art',
]

export function AITilePanel({ tileSize, paletteHint, onGenerated }) {
  const [prompt, setPrompt] = useState('')
  const { model, setModel, loading, error, run, AI_MODELS } = useAIModel()

  const handleGenerate = async () => {
    const result = await run(() => generateBaseTileWithAI({
      prompt,
      model,
      tileSize,
      role: 'center',
      paletteHint,
    }))
    if (result) onGenerated(result.pixels, result)
  }

  return (
    <div className="ai-panel generator-panel">
      <div className="sidebar-card-title">Tileset prompt</div>
      <div className="ai-hint">Describe the surface you want to turn into a tileset-ready base tile.</div>

      <textarea
        className="ai-prompt generator-textarea"
        placeholder="stone brick floor"
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        rows={6}
        disabled={loading}
      />

      <div className="ai-preset-row">
        {PROMPT_PRESETS.map((preset) => (
          <button
            key={preset}
            className="ai-preset-chip"
            type="button"
            onClick={() => setPrompt(preset)}
            disabled={loading}
            title={preset}
          >
            {preset}
          </button>
        ))}
      </div>

      <div className="sidebar-inline-label">
        <span className="brush-label">Style</span>
      </div>
      <select className="ai-model" value={model} onChange={e => setModel(e.target.value)} disabled={loading}>
        {AI_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
      </select>

      <button className="ai-generate-btn generator-submit-btn" onClick={handleGenerate} disabled={loading || !prompt.trim()}>
        {loading ? 'Generating...' : 'Generate Tileset'}
      </button>

      {error && <div className="ai-error">{error}</div>}
    </div>
  )
}

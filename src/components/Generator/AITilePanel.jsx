import { useState } from 'react'
import { generateBaseTileWithAI, AI_MODELS } from '../../core/aiTile.js'

const LS_KEY = 'openai_api_key'
const LS_MODEL = 'openai_image_model'
const PROMPT_PRESETS = [
  'mossy stone floor with crisp pixel edges',
  'volcanic rock with glowing cracks, pixel art',
  'snowy ground with subtle icy texture, pixel art',
]

function loadKey() {
  return localStorage.getItem(LS_KEY) || import.meta.env.VITE_OPENAI_API_KEY || ''
}

export function AITilePanel({ tileSize, onGenerated }) {
  const [prompt, setPrompt] = useState('')
  const [apiKey, setApiKey] = useState(loadKey)
  const [model, setModel] = useState(() => localStorage.getItem(LS_MODEL) || 'gpt-image-1')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleKeyChange = (v) => { setApiKey(v); localStorage.setItem(LS_KEY, v) }
  const handleModelChange = (v) => { setModel(v); localStorage.setItem(LS_MODEL, v) }

  const handleGenerate = async () => {
    setError('')
    setLoading(true)
    try {
      const pixels = await generateBaseTileWithAI({ prompt, apiKey, model, tileSize })
      onGenerated(pixels)
    } catch (e) {
      setError(e.message || 'Generation failed.')
    } finally {
      setLoading(false)
    }
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
      <select className="ai-model" value={model} onChange={e => handleModelChange(e.target.value)} disabled={loading}>
        {AI_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
      </select>

      <input
        className="ai-key"
        type="password"
        placeholder="OpenAI API key"
        value={apiKey}
        onChange={e => handleKeyChange(e.target.value)}
        disabled={loading}
      />

      <button className="ai-generate-btn generator-submit-btn" onClick={handleGenerate} disabled={loading || !prompt.trim() || !apiKey}>
        {loading ? 'Generating…' : 'Generate Tileset'}
      </button>

      {error && <div className="ai-error">{error}</div>}
    </div>
  )
}

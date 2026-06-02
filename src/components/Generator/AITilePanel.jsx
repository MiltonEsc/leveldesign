import { useState } from 'react'
import { generateBaseTileWithAI, AI_MODELS } from '../../core/aiTile.js'

const LS_KEY = 'openai_api_key'
const LS_MODEL = 'openai_image_model'

function loadKey() {
  return localStorage.getItem(LS_KEY) || import.meta.env.VITE_OPENAI_API_KEY || ''
}

export function AITilePanel({ tileSize, onGenerated }) {
  const [prompt, setPrompt]   = useState('')
  const [apiKey, setApiKey]   = useState(loadKey)
  const [model, setModel]     = useState(() => localStorage.getItem(LS_MODEL) || 'gpt-image-1')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

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
    <div className="ai-panel">
      <div className="panel-label">AI base tile</div>

      <textarea
        className="ai-prompt"
        placeholder="e.g. mossy green stone, cracked lava rock…"
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        rows={2}
        disabled={loading}
      />

      <select className="ai-model" value={model} onChange={e => handleModelChange(e.target.value)} disabled={loading}>
        {AI_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
      </select>

      <input
        className="ai-key"
        type="password"
        placeholder="OpenAI API key (sk-…)"
        value={apiKey}
        onChange={e => handleKeyChange(e.target.value)}
        disabled={loading}
      />

      <button className="ai-generate-btn" onClick={handleGenerate} disabled={loading || !prompt.trim() || !apiKey}>
        {loading ? 'Generating…' : 'Generate with AI'}
      </button>

      {error && <div className="ai-error">{error}</div>}
    </div>
  )
}

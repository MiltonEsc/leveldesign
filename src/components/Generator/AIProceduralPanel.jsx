import { useState } from 'react'
import { generateBaseTileWithAI, AI_MODELS } from '../../core/aiTile.js'

const LS_KEY = 'openai_api_key'
const LS_MODEL = 'openai_image_model'

function loadKey() {
  return localStorage.getItem(LS_KEY) || import.meta.env.VITE_OPENAI_API_KEY || ''
}

// Generates a CENTER texture (and optional BORDER texture) with AI, then hands
// them to the tilesheet to compose all 48 autotiles. The border is a distinct
// material (e.g. snow) so edges aren't a flat color.
export function AIProceduralPanel({ tileSize, onGenerated }) {
  const [center, setCenter] = useState('')
  const [border, setBorder] = useState('')
  const [apiKey, setApiKey] = useState(loadKey)
  const [model, setModel]   = useState(() => localStorage.getItem(LS_MODEL) || 'gpt-image-1')
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')

  const handleKeyChange = (v) => { setApiKey(v); localStorage.setItem(LS_KEY, v) }
  const handleModelChange = (v) => { setModel(v); localStorage.setItem(LS_MODEL, v) }

  const handleGenerate = async () => {
    setError('')
    setLoading(true)
    try {
      const centerPixels = await generateBaseTileWithAI({ prompt: center, apiKey, model, tileSize })
      let edgePixels = null
      if (border.trim()) {
        edgePixels = await generateBaseTileWithAI({ prompt: border, apiKey, model, tileSize })
      }
      onGenerated(centerPixels, edgePixels)
    } catch (e) {
      setError(e.message || 'Generation failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="ai-panel">
      <div className="panel-label">AI textures</div>

      <textarea
        className="ai-prompt"
        rows={2}
        placeholder="Center, e.g. dark cave rock with moss"
        value={center}
        onChange={e => setCenter(e.target.value)}
        disabled={loading}
      />
      <textarea
        className="ai-prompt"
        rows={2}
        placeholder="Border (optional), e.g. snow, ice, sand"
        value={border}
        onChange={e => setBorder(e.target.value)}
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

      <button className="ai-generate-btn" onClick={handleGenerate} disabled={loading || !center.trim() || !apiKey}>
        {loading ? 'Generating…' : 'Generate with AI'}
      </button>

      {error && <div className="ai-error">{error}</div>}
      <div className="ai-hint">Center + border become a full autotiled set. Leave border empty to use the biome palette.</div>
    </div>
  )
}

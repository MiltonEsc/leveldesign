import { useState } from 'react'
import { generateAssetWithAI, AI_MODELS } from '../../core/aiAsset.js'

const LS_KEY = 'openai_api_key'
const LS_MODEL = 'openai_image_model'
const LS_QUALITY = 'openai_image_quality'

const QUALITY_OPTIONS = [
  { value: 'low',    label: 'Low',    desc: 'Fastest · cheapest' },
  { value: 'medium', label: 'Medium', desc: 'Balanced' },
  { value: 'high',   label: 'High',   desc: 'Best detail · slower' },
]

const ASSET_PRESETS = [
  'oak tree', 'pine tree', 'palm tree',
  'wooden barrel', 'stone pillar', 'treasure chest',
  'campfire', 'wooden fence', 'stone well',
  'cactus', 'mushroom cluster', 'tent',
  'wooden house', 'stone tower', 'windmill',
  'bush', 'flower patch', 'hay bale',
]

function loadKey() {
  return localStorage.getItem(LS_KEY) || import.meta.env.VITE_OPENAI_API_KEY || ''
}

export function AssetAIPanel({ pxW, pxH, onGenerated }) {
  const [prompt, setPrompt] = useState('')
  const [apiKey, setApiKey] = useState(loadKey)
  const [model, setModel] = useState(() => localStorage.getItem(LS_MODEL) || 'gpt-image-1')
  const [quality, setQuality] = useState(() => localStorage.getItem(LS_QUALITY) || 'low')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleKeyChange = (v) => { setApiKey(v); localStorage.setItem(LS_KEY, v) }
  const handleModelChange = (v) => { setModel(v); localStorage.setItem(LS_MODEL, v) }
  const handleQualityChange = (v) => { setQuality(v); localStorage.setItem(LS_QUALITY, v) }

  const handleGenerate = async () => {
    setError('')
    setLoading(true)
    try {
      const pixels = await generateAssetWithAI({ prompt, apiKey, model, quality, pxW, pxH })
      onGenerated(pixels)
    } catch (e) {
      setError(e.message || 'Generation failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="ai-panel generator-panel">
      <div className="sidebar-card-title">Asset prompt</div>
      <div className="ai-hint">Generate a transparent prop at {pxW}×{pxH}px. Edit it with the drawing tools after generation.</div>

      <textarea
        className="ai-prompt generator-textarea"
        placeholder="oak tree, wooden barrel, stone tower…"
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        rows={4}
        disabled={loading}
      />

      <div className="preset-chips">
        {ASSET_PRESETS.map(p => (
          <button
            key={p}
            className={`preset-chip ${prompt === p ? 'on' : ''}`}
            onClick={() => setPrompt(p)}
            disabled={loading}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="sidebar-inline-label">
        <span className="brush-label">Model</span>
      </div>
      <select className="ai-model" value={model} onChange={e => handleModelChange(e.target.value)} disabled={loading}>
        {AI_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
      </select>

      <div className="sidebar-inline-label" style={{ marginTop: 6 }}>
        <span className="brush-label">Quality</span>
        <span className="tool-meta">{QUALITY_OPTIONS.find(q => q.value === quality)?.desc}</span>
      </div>
      <div className="ai-quality-row">
        {QUALITY_OPTIONS.map(q => (
          <button
            key={q.value}
            className={`ai-quality-btn ${quality === q.value ? 'on' : ''}`}
            onClick={() => handleQualityChange(q.value)}
            disabled={loading}
          >
            {q.label}
          </button>
        ))}
      </div>

      <input
        className="ai-key"
        type="password"
        placeholder="OpenAI API key"
        value={apiKey}
        onChange={e => handleKeyChange(e.target.value)}
        disabled={loading}
      />

      <button
        className="ai-generate-btn generator-submit-btn"
        onClick={handleGenerate}
        disabled={loading || !prompt.trim() || !apiKey}
      >
        {loading ? 'Generating…' : 'Generate Asset'}
      </button>

      {error && <div className="ai-error">{error}</div>}
    </div>
  )
}

import { useState } from 'react'
import { generateBaseTileWithAI, DITHER_OPTIONS } from '../../core/aiTile.js'
import { useAIModel } from '../../hooks/useAIModel.js'

const TEXTURE_PRESETS = [
  {
    label: 'Frozen cavern',
    center: 'dark cave rock with subtle moss, pixel art texture',
    border: 'powder snow with icy sparkle, pixel art texture',
  },
  {
    label: 'Desert ruins',
    center: 'sun-baked sandstone floor, pixel art texture',
    border: 'wind-blown sand drift, pixel art texture',
  },
  {
    label: 'Corrupted forest',
    center: 'muddy forest ground with roots, pixel art texture',
    border: 'glowing toxic moss edge, pixel art texture',
  },
]

// Generates a CENTER texture (and optional BORDER texture) with AI, then hands
// them to the tilesheet to compose all 48 autotiles. The border is a distinct
// material (e.g. snow) so edges aren't a flat color.
export function AIProceduralPanel({ tileSize, paletteHint, onGenerated }) {
  const [center, setCenter] = useState('')
  const [border, setBorder] = useState('')
  const [dither, setDither] = useState(DITHER_OPTIONS[0].value)
  const { model, setModel, loading, error, run, models } = useAIModel()

  const handleGenerate = async () => {
    const result = await run(async () => {
      const centerResult = await generateBaseTileWithAI({
        prompt: center,
        model,
        tileSize,
        role: 'center',
        paletteHint,
        dither,
      })
      let edgeResult = null
      if (border.trim()) {
        edgeResult = await generateBaseTileWithAI({
          prompt: border,
          model,
          tileSize,
          role: 'edge',
          paletteHint,
          contextPrompt: center,
          dither,
        })
      }
      return { centerResult, edgeResult }
    })
    if (result) {
      onGenerated(result.centerResult.pixels, result.edgeResult?.pixels || null, {
        center: result.centerResult,
        edge: result.edgeResult,
      })
    }
  }

  return (
    <div className="ai-panel">
      <div className="panel-label">AI textures</div>
      <div className="ai-hint">Use a center material plus an optional edge material to build a full autotile set.</div>

      <div className="ai-preset-stack">
        {TEXTURE_PRESETS.map((preset) => (
          <button
            key={preset.label}
            className="ai-preset-block"
            type="button"
            onClick={() => { setCenter(preset.center); setBorder(preset.border) }}
            disabled={loading}
          >
            <span className="ai-preset-title">{preset.label}</span>
            <span className="ai-preset-copy">{preset.center}</span>
          </button>
        ))}
      </div>

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

      <select className="ai-model" value={model} onChange={e => setModel(e.target.value)} disabled={loading}>
        {models.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
      </select>
      <select className="ai-model" value={dither} onChange={e => setDither(e.target.value)} disabled={loading} title="Dithering">
        {DITHER_OPTIONS.map(d => <option key={d.value} value={d.value}>Dither: {d.label}</option>)}
      </select>

      <button className="ai-generate-btn" onClick={handleGenerate} disabled={loading || !center.trim()}>
        {loading ? 'Generating...' : 'Generate with AI'}
      </button>

      {error && <div className="ai-error">{error}</div>}
      <div className="ai-hint">Center + border become a full autotiled set. Leave border empty to use the biome palette.</div>
    </div>
  )
}

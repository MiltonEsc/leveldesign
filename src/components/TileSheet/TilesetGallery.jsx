import { useEffect, useRef, useState } from 'react'
import { base64ToBytes } from '../../lib/serialize.js'

// Small thumbnail: a color swatch for procedural tilesets, or the base tile for draw.
function TilesetThumb({ definition, size = 40 }) {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, size, size)

    if (definition?.mode === 'draw' && definition.basePixels) {
      // Render the saved base tile (its native dimensions are square)
      const bytes = base64ToBytes(definition.basePixels)
      const side = Math.round(Math.sqrt(bytes.length / 4))
      if (side > 0) {
        const tmp = document.createElement('canvas')
        tmp.width = side; tmp.height = side
        tmp.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(bytes), side, side), 0, 0)
        ctx.drawImage(tmp, 0, 0, side, side, 0, 0, size, size)
      }
    } else {
      const c = definition?.colors || {}
      ctx.fillStyle = c.primary || '#444'
      ctx.fillRect(0, 0, size, size)
      ctx.fillStyle = c.border || '#222'
      ctx.fillRect(0, 0, size, 5)
      ctx.fillRect(0, size - 5, size, 5)
      ctx.fillRect(0, 0, 5, size)
      ctx.fillRect(size - 5, 0, 5, size)
    }
  }, [definition, size])

  return <canvas ref={ref} width={size} height={size} style={{ imageRendering: 'pixelated', borderRadius: 4 }} />
}

export function TilesetGallery({ tilesets, defaultName, onSave, onLoad, onRemove }) {
  const [name, setName] = useState('')

  const handleSave = () => {
    onSave(name.trim() || defaultName)
    setName('')
  }

  return (
    <div className="tileset-gallery">
      <div className="tileset-save-row">
        <input
          className="tileset-name-input"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={defaultName}
        />
        <button className="tileset-save-btn" onClick={handleSave} title="Save current tileset to the cloud">💾 Save</button>
      </div>

      <div className="tileset-gallery-title">Saved tilesets ({tilesets.length})</div>
      {tilesets.length === 0 ? (
        <div className="tileset-gallery-empty">None yet. Tune a tileset, then Save.</div>
      ) : (
        <div className="tileset-gallery-grid">
          {tilesets.map(t => (
            <div
              key={t.id}
              className="tileset-card"
              onClick={() => onLoad(t)}
              title={`${t.name} · ${t.tile_size}px · ${t.definition?.mode}`}
            >
              <TilesetThumb definition={t.definition} />
              <span className="tileset-card-name">{t.name}</span>
              <button
                className="tileset-card-del"
                onClick={(e) => { e.stopPropagation(); onRemove(t.id) }}
                title="Delete"
              >🗑</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

import { useState, useEffect, useRef } from 'react'
import { BiomeCard } from './BiomeCard.jsx'
import { SavedTilesetCard } from './SavedTilesetCard.jsx'

// Thumbnail of a saved prop (transparent-aware)
function PropThumb({ asset, size = 44 }) {
  const ref = useRef(null)
  const pxW = asset.cols * asset.tileSize
  const pxH = asset.rows * asset.tileSize
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, size, size)
    const scale = Math.min(size / pxW, size / pxH)
    const dW = pxW * scale, dH = pxH * scale
    const tmp = document.createElement('canvas')
    tmp.width = pxW; tmp.height = pxH
    tmp.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(asset.pixels), pxW, pxH), 0, 0)
    ctx.drawImage(tmp, (size - dW) / 2, (size - dH) / 2, dW, dH)
  }, [asset, pxW, pxH, size])
  return <canvas ref={ref} width={size} height={size} className="checker-bg" style={{ imageRendering: 'pixelated', borderRadius: 4 }} />
}

// Tabbed bottom dock: Tilesets (preset biomes + cloud-saved tilesets) and Props.
export function GalleryDock({
  biomes, activeBiomeId, tileSize, onSelectBiome,
  tilesets, defaultName, onSaveTileset, onLoadTileset, onRemoveTileset,
  assets, selectedAssetId, onSelectAsset,
}) {
  const [tab, setTab] = useState('tilesets')
  const [name, setName] = useState('')
  const [query, setQuery] = useState('')
  const [tilesetScope, setTilesetScope] = useState('all')

  const handleSave = () => {
    onSaveTileset(name.trim() || defaultName)
    setName('')
  }

  const normalizedQuery = query.trim().toLowerCase()
  const filteredBiomes = biomes.filter((biome) =>
    biome.label.toLowerCase().includes(normalizedQuery) || biome.id.toLowerCase().includes(normalizedQuery)
  )
  const filteredTilesets = tilesets.filter((tileset) =>
    tileset.name.toLowerCase().includes(normalizedQuery)
  )
  const filteredAssets = assets.filter((asset) =>
    asset.name.toLowerCase().includes(normalizedQuery)
  )

  return (
    <div className="gallery-dock">
      <div className="gallery-dock-head">
        <div className="gallery-dock-left">
          <div className="gallery-tabs">
            <button className={`gallery-tab ${tab === 'tilesets' ? 'active' : ''}`} onClick={() => setTab('tilesets')}>
              Tilesets
            </button>
            <button className={`gallery-tab ${tab === 'props' ? 'active' : ''}`} onClick={() => setTab('props')}>
              Props ({assets.length})
            </button>
          </div>
          {tab === 'tilesets' && (
            <div className="gallery-scope">
              <button className={`gallery-scope-btn ${tilesetScope === 'all' ? 'active' : ''}`} onClick={() => setTilesetScope('all')}>All</button>
              <button className={`gallery-scope-btn ${tilesetScope === 'biomes' ? 'active' : ''}`} onClick={() => setTilesetScope('biomes')}>Biomes</button>
              <button className={`gallery-scope-btn ${tilesetScope === 'saved' ? 'active' : ''}`} onClick={() => setTilesetScope('saved')}>Saved</button>
            </div>
          )}
        </div>

        <div className="gallery-head-actions">
          <input
            className="gallery-filter-input"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={tab === 'tilesets' ? 'Filter tilesets or biomes' : 'Filter props'}
          />

          {tab === 'tilesets' && (
            <div className="gallery-save">
              <input
                className="gallery-save-input"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={defaultName}
              />
              <button className="gallery-save-btn" onClick={handleSave} title="Save current tileset to the gallery">Save</button>
            </div>
          )}
        </div>
      </div>

      <div className="gallery-dock-row">
        {tab === 'tilesets' ? (
          <>
            {tilesetScope !== 'saved' && filteredBiomes.map(biome => (
              <BiomeCard
                key={biome.id}
                biome={biome}
                tileSize={tileSize}
                isActive={biome.id === activeBiomeId}
                onClick={() => onSelectBiome(biome)}
              />
            ))}
            {tilesetScope !== 'biomes' && filteredTilesets.map(t => (
              <SavedTilesetCard key={t.id} tileset={t} onLoad={onLoadTileset} onRemove={onRemoveTileset} />
            ))}
            {((tilesetScope !== 'saved' && filteredBiomes.length === 0) && (tilesetScope !== 'biomes' && filteredTilesets.length === 0)) && (
              <div className="gallery-dock-empty">No matches for that filter.</div>
            )}
            {(tilesetScope === 'saved' && filteredTilesets.length === 0) && (
              <div className="gallery-dock-empty">No saved tilesets match that filter.</div>
            )}
            {(tilesetScope === 'biomes' && filteredBiomes.length === 0) && (
              <div className="gallery-dock-empty">No biome presets match that filter.</div>
            )}
          </>
        ) : (
          filteredAssets.length === 0 ? (
            <div className="gallery-dock-empty">No props yet. Create them in the Assets view, then place them on a level.</div>
          ) : (
            filteredAssets.map(a => (
              <button
                key={a.id}
                className={`prop-dock-card ${selectedAssetId === a.id ? 'selected' : ''}`}
                onClick={() => onSelectAsset(a.id)}
                title={`${a.name} · ${a.cols}×${a.rows}`}
              >
                <PropThumb asset={a} />
                <span className="prop-dock-name">{a.name}</span>
              </button>
            ))
          )
        )}
      </div>
    </div>
  )
}

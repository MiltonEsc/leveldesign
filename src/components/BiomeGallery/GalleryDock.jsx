import { useState, useEffect, useRef } from 'react'
import { Segmented } from '../ui/Segmented.jsx'
import { Btn }       from '../ui/Btn.jsx'
import { BiomeCardPreview } from './BiomeCardPreview.jsx'
import { tilesFromDefinition } from '../../core/tilesetDefinition.js'

// Palette-stripe thumbnail for a tileset/biome (hero color + stacked rest).
function PaletteThumb({ colors }) {
  const c = colors || {}
  const hero = c.primary || '#3a3f47'
  const rest = [c.secondary, c.border, c.highlight, c.shadow].filter(Boolean)
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
      <div style={{ flex: 2, background: hero }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {rest.map((col, i) => <div key={i} style={{ flex: 1, background: col }} />)}
      </div>
    </div>
  )
}

// Transparent-aware prop thumbnail rendered from pixel data.
function PropThumb({ asset }) {
  const ref = useRef(null)
  const pxW = asset.cols * asset.tileSize
  const pxH = asset.rows * asset.tileSize
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const box = 100
    cv.width = box; cv.height = box
    const ctx = cv.getContext('2d')
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, box, box)
    const scale = Math.min(box / pxW, box / pxH)
    const dW = pxW * scale, dH = pxH * scale
    const tmp = document.createElement('canvas')
    tmp.width = pxW; tmp.height = pxH
    tmp.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(asset.pixels), pxW, pxH), 0, 0)
    ctx.drawImage(tmp, (box - dW) / 2, (box - dH) / 2, dW, dH)
  }, [asset, pxW, pxH])
  return <canvas ref={ref} />
}

// Lazy tile-preview thumbnail for a saved tileset definition.
function SavedTileThumb({ definition, tileSize }) {
  const [tiles, setTiles] = useState(null)
  useEffect(() => {
    try { setTiles(tilesFromDefinition(definition, tileSize || 16)) }
    catch { setTiles(null) }
  }, [definition, tileSize])
  return <BiomeCardPreview tiles={tiles} tileSize={tileSize || 16} />
}

// Bottom library drawer: Tilesets (biome presets + cloud-saved) and Props.
export function GalleryDock({
  biomes, activeBiomeId, activeSavedTilesetId, onSelectBiome,
  tilesets, defaultName, onSaveTileset, onLoadTileset, onRemoveTileset,
  assets, selectedAssetId, onSelectAsset,
}) {
  const [tab, setTab] = useState('tilesets')
  const [scope, setScope] = useState('all')
  const [search, setSearch] = useState('')
  const [name, setName] = useState('')

  const q = search.trim().toLowerCase()
  const biomeList = biomes.filter(b => b.label.toLowerCase().includes(q) || b.id.toLowerCase().includes(q))
  const savedList = tilesets.filter(t => t.name.toLowerCase().includes(q))
  const propList  = assets.filter(a => a.name.toLowerCase().includes(q))

  const handleSave = () => { onSaveTileset(name.trim() || defaultName); setName('') }

  const showBiomes = tab === 'tilesets' && scope !== 'saved'
  const showSaved  = tab === 'tilesets' && scope !== 'biomes'

  return (
    <footer className="library">
      <div className="lib-head">
        <Segmented size="sm" value={tab} onChange={setTab}
          options={[{ value: 'tilesets', label: 'Tilesets' }, { value: 'props', label: `Props · ${assets.length}` }]} />
        {tab === 'tilesets' && (
          <div className="lib-filters">
            {[['all', 'All'], ['biomes', 'Biomes'], ['saved', 'Saved']].map(([v, l]) => (
              <button key={v} className={`filter-chip ${scope === v ? 'on' : ''}`} onClick={() => setScope(v)}>{l}</button>
            ))}
          </div>
        )}
        <div className="spacer" />
        <input className="text-input lib-search" value={search} onChange={e => setSearch(e.target.value)}
          placeholder={tab === 'tilesets' ? 'Filter tilesets…' : 'Filter props…'} />
        {tab === 'tilesets' && (
          <>
            <input className="text-input lib-name" value={name} onChange={e => setName(e.target.value)} placeholder={defaultName} />
            <Btn variant="primary" size="sm" icon="save" onClick={handleSave}>Save</Btn>
          </>
        )}
      </div>

      <div className="lib-rail">
        {tab === 'tilesets' ? (
          <>
            {showBiomes && biomeList.map(b => (
              <button key={b.id} className={`lib-card ${b.id === activeBiomeId ? 'on' : ''}`} onClick={() => onSelectBiome(b)}>
                <div className="lib-thumb"><PaletteThumb colors={b.colors} /></div>
                <div className="lib-card-foot"><span className="lib-card-name">{b.label}</span></div>
              </button>
            ))}
            {showSaved && savedList.map(t => (
              <button key={t.id} className={`lib-card ${t.id === activeSavedTilesetId ? 'on' : ''}`} onClick={() => onLoadTileset(t)}>
                <div className="lib-thumb">
                  <SavedTileThumb definition={t.definition} tileSize={t.tile_size} />
                </div>
                <div className="lib-card-foot lib-card-foot--saved">
                  <div className="lib-card-foot-row">
                    <span className="lib-card-name">{t.name}</span>
                    <button className="lib-card-del" title="Delete" onClick={(e) => { e.stopPropagation(); onRemoveTileset(t.id) }}>×</button>
                  </div>
                  <div className="lib-card-foot-meta">
                    <span className="lib-card-size">{t.tile_size || 16}px</span>
                    <span className="lib-tag">saved</span>
                  </div>
                </div>
              </button>
            ))}
            {showBiomes && showSaved && biomeList.length === 0 && savedList.length === 0 && <div className="lib-empty">No matches.</div>}
            {scope === 'saved' && savedList.length === 0 && <div className="lib-empty">No saved tilesets.</div>}
            {scope === 'biomes' && biomeList.length === 0 && <div className="lib-empty">No biome presets match.</div>}
          </>
        ) : (
          propList.length === 0
            ? <div className="lib-empty">No props yet. Create them in the Assets view.</div>
            : propList.map(a => (
              <button key={a.id} className={`lib-card ${selectedAssetId === a.id ? 'on' : ''}`} onClick={() => onSelectAsset(a.id)}>
                <div className="lib-thumb checker-bg"><PropThumb asset={a} /></div>
                <div className="lib-card-foot"><span className="lib-card-name">{a.name}</span><span className="lib-tag">{a.cols}×{a.rows}</span></div>
              </button>
            ))
        )}
      </div>
    </footer>
  )
}

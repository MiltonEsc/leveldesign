import { useState, useEffect } from 'react'
import { BiomeCardPreview } from './BiomeCardPreview.jsx'
import { generateAllBiomeTiles } from '../../core/proceduralGen.js'
import { generateAllTiles } from '../../core/tileGenerator.js'
import { BIOME_MAP, BIOMES } from '../../constants/biomes.js'
import { base64ToBytes } from '../../lib/serialize.js'

// Regenerates the 48 tiles from a saved tileset definition (cheap; cached in state).
function tilesFromDefinition(def, tileSize) {
  if (def?.mode === 'draw') {
    const bytes = base64ToBytes(def.basePixels)
    const side = Math.round(Math.sqrt(bytes.length / 4))
    return generateAllTiles(new ImageData(new Uint8ClampedArray(bytes), side, side), side)
  }
  const base = BIOME_MAP[def?.biomeId] || BIOMES[0]
  const biome = { ...base, colors: { ...base.colors, ...(def?.colors || {}) } }
  return generateAllBiomeTiles(biome, tileSize)
}

export function SavedTilesetCard({ tileset, onLoad, onRemove }) {
  const [tiles, setTiles] = useState(null)
  const size = tileset.tile_size

  useEffect(() => {
    try { setTiles(tilesFromDefinition(tileset.definition, size)) }
    catch { setTiles(null) }
  }, [tileset, size])

  return (
    <button
      className="biome-card saved-tileset-card"
      onClick={() => onLoad(tileset)}
      title={`Load "${tileset.name}" · ${size}px · ${tileset.definition?.mode}`}
    >
      <BiomeCardPreview tiles={tiles} tileSize={size} />
      <span className="biome-card-label">💾 {tileset.name}</span>
      <span
        className="saved-tileset-del"
        onClick={(e) => { e.stopPropagation(); onRemove(tileset.id) }}
        title="Delete tileset"
      >🗑</span>
    </button>
  )
}

import { generateAllBiomeTiles, generateTilesFromTextures } from './proceduralGen.js'
import { generateAllTiles } from './tileGenerator.js'
import { BIOME_MAP, BIOMES } from '../constants/biomes.js'
import { base64ToBytes } from '../lib/serialize.js'

export function tilesFromDefinition(def, tileSize) {
  if (def?.mode === 'draw') {
    const bytes = base64ToBytes(def.basePixels)
    const side = Math.round(Math.sqrt(bytes.length / 4))
    return generateAllTiles(new ImageData(new Uint8ClampedArray(bytes), side, side), side)
  }
  if (def?.mode === 'textures') {
    const center = new Uint8ClampedArray(base64ToBytes(def.centerPixels))
    const centerData = new ImageData(center, tileSize, tileSize)
    const edgeData = def.edgePixels
      ? new ImageData(new Uint8ClampedArray(base64ToBytes(def.edgePixels)), tileSize, tileSize)
      : null
    return generateTilesFromTextures(centerData, edgeData, tileSize, def.colors || {})
  }
  const base = BIOME_MAP[def?.biomeId] || BIOMES[0]
  const biome = { ...base, colors: { ...base.colors, ...(def?.colors || {}) } }
  return generateAllBiomeTiles(biome, tileSize)
}

import { useState, useCallback } from 'react'
import { BIOMES } from '../constants/biomes.js'
import { generateAllBiomeTiles } from '../core/proceduralGen.js'

export function useBiomeGallery(tileSize) {
  const [activeBiomeId, setActiveBiomeId] = useState(BIOMES[0].id)
  // Cache generated tiles per biome id
  const [biomeCache, setBiomeCache] = useState({})

  const getOrGenerate = useCallback((biomeId, size) => {
    const key = `${biomeId}_${size}`
    if (biomeCache[key]) return biomeCache[key]

    const biome = BIOMES.find(b => b.id === biomeId)
    if (!biome) return null

    const tiles = generateAllBiomeTiles(biome, size)
    setBiomeCache(prev => ({ ...prev, [key]: tiles }))
    return tiles
  }, [biomeCache])

  const switchBiome = useCallback((biomeId, size, onReady) => {
    setActiveBiomeId(biomeId)
    const tiles = getOrGenerate(biomeId, size)
    if (onReady) onReady(tiles)
  }, [getOrGenerate])

  const activeBiome = BIOMES.find(b => b.id === activeBiomeId)

  return {
    biomes: BIOMES,
    activeBiomeId,
    activeBiome,
    switchBiome,
    getOrGenerate,
  }
}

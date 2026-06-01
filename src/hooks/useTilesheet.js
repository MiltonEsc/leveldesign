import { useState, useCallback } from 'react'
import { generateAllTiles } from '../core/tileGenerator.js'
import { generateAllBiomeTiles } from '../core/proceduralGen.js'

export function useTilesheet() {
  const [tiles, setTiles] = useState(null)
  const [ready, setReady] = useState(false)

  const generateFromBitmap = useCallback((imageData, tileSize) => {
    setReady(false)
    const result = generateAllTiles(imageData, tileSize)
    setTiles(result)
    setReady(true)
  }, [])

  const generateFromBiome = useCallback((biome, tileSize) => {
    setReady(false)
    const result = generateAllBiomeTiles(biome, tileSize)
    setTiles(result)
    setReady(true)
  }, [])

  const clear = useCallback(() => {
    setTiles(null)
    setReady(false)
  }, [])

  return { tiles, ready, generateFromBitmap, generateFromBiome, clear }
}

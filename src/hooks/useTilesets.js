import { useState, useEffect, useCallback } from 'react'
import { listTilesets, saveTileset, removeTileset } from '../lib/db.js'

// Saved tilesets persisted in Supabase. A tileset row stores the DEFINITION that
// regenerates its 48 tiles (cheap), not the rendered pixels:
//   { mode:'procedural', biomeId, colors } | { mode:'draw', basePixels:base64 }
export function useTilesets() {
  const [tilesets, setTilesets] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    listTilesets()
      .then(rows => { if (!cancelled) setTilesets(rows) })
      .catch(e => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [])

  const save = useCallback(async ({ name, tileSize, definition }) => {
    setError('')
    try {
      const row = await saveTileset({ name, tileSize, definition })
      setTilesets(prev => [...prev, row])
      return row
    } catch (e) {
      setError(e.message)
      return null
    }
  }, [])

  const remove = useCallback(async (id) => {
    setError('')
    setTilesets(prev => prev.filter(t => t.id !== id))
    try {
      await removeTileset(id)
    } catch (e) {
      setError(e.message)
    }
  }, [])

  return { tilesets, error, save, remove }
}

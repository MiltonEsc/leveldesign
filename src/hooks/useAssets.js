import { useState, useEffect, useCallback } from 'react'
import { bytesToBase64, base64ToBytes } from '../lib/serialize.js'
import { listAssets, addAsset, removeAsset } from '../lib/db.js'

// Maps a Supabase row → in-app asset (pixels as Uint8ClampedArray)
function rowToAsset(row) {
  return {
    id: row.id,
    name: row.name,
    cols: row.cols,
    rows: row.rows,
    tileSize: row.tile_size,
    pixels: base64ToBytes(row.pixels),
  }
}

// Gallery of saved props, persisted in Supabase (shared, no login).
export function useAssets() {
  const [assets, setAssets] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    listAssets()
      .then(rows => { if (!cancelled) setAssets(rows.map(rowToAsset)) })
      .catch(e => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const add = useCallback(async ({ name, cols, rows, tileSize, pixels }) => {
    setError('')
    try {
      const row = await addAsset({ name: name || 'prop', cols, rows, tileSize, pixelsB64: bytesToBase64(pixels) })
      const asset = rowToAsset(row)
      setAssets(prev => [...prev, asset])
      setSelectedId(asset.id)
      return asset.id
    } catch (e) {
      setError(e.message)
      return null
    }
  }, [])

  const remove = useCallback(async (id) => {
    setError('')
    // optimistic
    setAssets(prev => prev.filter(a => a.id !== id))
    setSelectedId(prev => (prev === id ? null : prev))
    try {
      await removeAsset(id)
    } catch (e) {
      setError(e.message)
    }
  }, [])

  const select = useCallback((id) => setSelectedId(id), [])
  const getById = useCallback((id) => assets.find(a => a.id === id) || null, [assets])

  return { assets, selectedId, loading, error, add, remove, select, getById }
}

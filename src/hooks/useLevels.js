import { useState, useEffect, useCallback } from 'react'
import { listLevels, saveLevel, removeLevel } from '../lib/db.js'

// Saved levels persisted in Supabase. A level row stores the terrain grid
// (base64), placed props, size, the embedded tileset definition, and flags.
export function useLevels() {
  const [levels, setLevels] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    listLevels()
      .then(rows => { if (!cancelled) setLevels(rows) })
      .catch(e => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [])

  const save = useCallback(async (payload) => {
    setError('')
    try {
      const row = await saveLevel(payload)
      setLevels(prev => [...prev, row])
      return row
    } catch (e) {
      setError(e.message)
      return null
    }
  }, [])

  const remove = useCallback(async (id) => {
    setError('')
    setLevels(prev => prev.filter(l => l.id !== id))
    try {
      await removeLevel(id)
    } catch (e) {
      setError(e.message)
    }
  }, [])

  return { levels, error, save, remove }
}

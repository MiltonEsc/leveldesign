import { useState, useEffect, useCallback } from 'react'

const LS_KEY = 'tileset_studio_assets'

// ── base64 (de)serialization for the pixel buffers ──────────────────────────
function bytesToBase64(bytes) {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

function base64ToBytes(b64) {
  const bin = atob(b64)
  const out = new Uint8ClampedArray(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function serialize(assets) {
  return JSON.stringify(assets.map(a => ({
    id: a.id, name: a.name, cols: a.cols, rows: a.rows, tileSize: a.tileSize,
    pixels: bytesToBase64(a.pixels),
  })))
}

function deserialize(json) {
  try {
    const arr = JSON.parse(json)
    if (!Array.isArray(arr)) return []
    return arr.map(a => ({ ...a, pixels: base64ToBytes(a.pixels) }))
  } catch {
    return []
  }
}

function loadAssets() {
  const raw = localStorage.getItem(LS_KEY)
  return raw ? deserialize(raw) : []
}

// Gallery of saved props, persisted to localStorage.
export function useAssets() {
  const [assets, setAssets] = useState(loadAssets)
  const [selectedId, setSelectedId] = useState(null)

  // Persist on every change
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, serialize(assets))
    } catch (e) {
      console.warn('Could not persist assets (localStorage full?):', e)
    }
  }, [assets])

  const add = useCallback(({ name, cols, rows, tileSize, pixels }) => {
    const id = (crypto?.randomUUID?.() ?? String(Date.now() + Math.random()))
    const asset = { id, name: name || 'prop', cols, rows, tileSize, pixels: new Uint8ClampedArray(pixels) }
    setAssets(prev => [...prev, asset])
    setSelectedId(id)
    return id
  }, [])

  const remove = useCallback((id) => {
    setAssets(prev => prev.filter(a => a.id !== id))
    setSelectedId(prev => (prev === id ? null : prev))
  }, [])

  const update = useCallback((id, patch) => {
    setAssets(prev => prev.map(a => (a.id === id ? { ...a, ...patch } : a)))
  }, [])

  const rename = useCallback((id, name) => {
    setAssets(prev => prev.map(a => (a.id === id ? { ...a, name } : a)))
  }, [])

  const select = useCallback((id) => setSelectedId(id), [])

  const getById = useCallback((id) => assets.find(a => a.id === id) || null, [assets])

  return { assets, selectedId, add, remove, update, rename, select, getById }
}

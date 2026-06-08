import { useState, useCallback } from 'react'
import { AI_MODELS } from '../core/aiTile.js'
import { STORAGE_KEYS } from '../constants/storageKeys.js'

const DEFAULT_MODEL = AI_MODELS[0]?.id || 'gemini-2.5-flash-image'

function loadModel() {
  const stored = localStorage.getItem(STORAGE_KEYS.AI_IMAGE_MODEL)
  return AI_MODELS.some(m => m.id === stored) ? stored : DEFAULT_MODEL
}

// Shared state for the three AI generation panels (tile / procedural / asset):
// the persisted model choice plus the loading/error lifecycle and a `run`
// wrapper that handles the try/catch/finally boilerplate around a generation.
export function useAIModel() {
  const [model, setModel] = useState(loadModel)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleModelChange = useCallback((v) => {
    setModel(v)
    localStorage.setItem(STORAGE_KEYS.AI_IMAGE_MODEL, v)
  }, [])

  // Runs an async generation, managing loading + error state. Returns the
  // generator's result (or undefined on failure, with `error` set).
  const run = useCallback(async (fn) => {
    setError('')
    setLoading(true)
    try {
      return await fn()
    } catch (e) {
      setError(e.message || 'Generation failed.')
    } finally {
      setLoading(false)
    }
  }, [])

  return { model, setModel: handleModelChange, loading, error, run, AI_MODELS }
}

import { useState, useCallback, useRef } from 'react'
import { createGrid } from '../core/autotile.js'
import { GENERATORS } from '../core/levelGenerator.js'

export function useLevelMap(initialW = 32, initialH = 20) {
  const [width, setWidth]   = useState(initialW)
  const [height, setHeight] = useState(initialH)
  const [grid, setGrid]     = useState(() => createGrid(initialW, initialH))
  const [seamlessEdges, setSeamlessEdges] = useState(false)
  const paintValue = useRef(1)

  const paintCell = useCallback((x, y, value) => {
    setGrid(prev => {
      if (x < 0 || x >= width || y < 0 || y >= height) return prev
      const idx = y * width + x
      if (prev[idx] === value) return prev
      const next = new Uint8Array(prev)
      next[idx] = value
      return next
    })
  }, [width, height])

  const startPaint = useCallback((x, y, erase) => {
    paintValue.current = erase ? 0 : 1
    paintCell(x, y, paintValue.current)
  }, [paintCell])

  const continuePaint = useCallback((x, y) => {
    paintCell(x, y, paintValue.current)
  }, [paintCell])

  const generate = useCallback((type, opts = {}) => {
    const gen = GENERATORS[type]
    if (!gen) return
    setGrid(gen.fn(width, height, opts))
  }, [width, height])

  const clear = useCallback(() => {
    setGrid(createGrid(width, height))
  }, [width, height])

  const fillAll = useCallback(() => {
    setGrid(createGrid(width, height, 1))
  }, [width, height])

  const resize = useCallback((w, h) => {
    setWidth(w)
    setHeight(h)
    setGrid(prev => {
      // Preserve overlapping region
      const next = createGrid(w, h)
      const copyW = Math.min(w, width)
      const copyH = Math.min(h, height)
      for (let y = 0; y < copyH; y++) {
        for (let x = 0; x < copyW; x++) {
          next[y * w + x] = prev[y * width + x]
        }
      }
      return next
    })
  }, [width, height])

  return {
    width, height, grid, seamlessEdges, setSeamlessEdges,
    startPaint, continuePaint, generate, clear, fillAll, resize,
  }
}

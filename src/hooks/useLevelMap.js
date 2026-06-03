import { useState, useCallback, useRef } from 'react'
import { createGrid } from '../core/autotile.js'
import { GENERATORS } from '../core/levelGenerator.js'

export function useLevelMap(initialW = 32, initialH = 20) {
  const [width, setWidth]   = useState(initialW)
  const [height, setHeight] = useState(initialH)
  const [grid, setGrid]     = useState(() => createGrid(initialW, initialH))
  const [manualTiles, setManualTiles] = useState(() => new Int16Array(initialW * initialH).fill(-1))
  const [seamlessEdges, setSeamlessEdges] = useState(false)
  // Props placed on the level: { id, assetId, x, y } (x,y = anchor cell, top-left)
  const [placedProps, setPlacedProps] = useState([])
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

  const getCell = useCallback((x, y) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return 0
    return grid[y * width + x]
  }, [grid, width, height])

  const getManualTile = useCallback((x, y) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return -1
    return manualTiles[y * width + x]
  }, [manualTiles, width, height])

  const paintManualArea = useCallback((cx, cy, tileIndex, brushSize = 1) => {
    setManualTiles(prev => {
      const next = new Int16Array(prev)
      let changed = false
      const r = Math.max(0, brushSize - 1)
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const x = cx + dx
          const y = cy + dy
          if (x < 0 || x >= width || y < 0 || y >= height) continue
          const idx = y * width + x
          if (next[idx] === tileIndex) continue
          next[idx] = tileIndex
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [width, height])

  const fillManualAt = useCallback((cx, cy, tileIndex) => {
    setManualTiles(prev => {
      if (cx < 0 || cx >= width || cy < 0 || cy >= height) return prev
      const target = prev[cy * width + cx]
      if (target === tileIndex) return prev
      const next = new Int16Array(prev)
      const stack = [[cx, cy]]
      while (stack.length) {
        const [x, y] = stack.pop()
        if (x < 0 || x >= width || y < 0 || y >= height) continue
        const idx = y * width + x
        if (next[idx] !== target) continue
        next[idx] = tileIndex
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1])
      }
      return next
    })
  }, [width, height])

  const fillManualRect = useCallback((a, b, tileIndex) => {
    setManualTiles(prev => {
      const next = new Int16Array(prev)
      let changed = false
      const x0 = Math.max(0, Math.min(a.x, b.x))
      const y0 = Math.max(0, Math.min(a.y, b.y))
      const x1 = Math.min(width - 1, Math.max(a.x, b.x))
      const y1 = Math.min(height - 1, Math.max(a.y, b.y))
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const idx = y * width + x
          if (next[idx] === tileIndex) continue
          next[idx] = tileIndex
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [width, height])

  const clearManualTiles = useCallback(() => {
    setManualTiles(new Int16Array(width * height).fill(-1))
  }, [width, height])

  const clearManualArea = useCallback((cx, cy, brushSize = 1) => {
    setManualTiles(prev => {
      const next = new Int16Array(prev)
      let changed = false
      const r = Math.max(0, brushSize - 1)
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const x = cx + dx
          const y = cy + dy
          if (x < 0 || x >= width || y < 0 || y >= height) continue
          const idx = y * width + x
          if (next[idx] === -1) continue
          next[idx] = -1
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [width, height])

  const clearManualFill = useCallback((cx, cy) => {
    setManualTiles(prev => {
      if (cx < 0 || cx >= width || cy < 0 || cy >= height) return prev
      const target = prev[cy * width + cx]
      if (target === -1) return prev
      const next = new Int16Array(prev)
      const stack = [[cx, cy]]
      while (stack.length) {
        const [x, y] = stack.pop()
        if (x < 0 || x >= width || y < 0 || y >= height) continue
        const idx = y * width + x
        if (next[idx] !== target) continue
        next[idx] = -1
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1])
      }
      return next
    })
  }, [width, height])

  const clearManualRect = useCallback((a, b) => {
    setManualTiles(prev => {
      const next = new Int16Array(prev)
      let changed = false
      const x0 = Math.max(0, Math.min(a.x, b.x))
      const y0 = Math.max(0, Math.min(a.y, b.y))
      const x1 = Math.min(width - 1, Math.max(a.x, b.x))
      const y1 = Math.min(height - 1, Math.max(a.y, b.y))
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const idx = y * width + x
          if (next[idx] === -1) continue
          next[idx] = -1
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [width, height])

  const paintArea = useCallback((cx, cy, value, brushSize = 1) => {
    setGrid(prev => {
      const next = new Uint8Array(prev)
      let changed = false
      const r = Math.max(0, brushSize - 1)
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const x = cx + dx
          const y = cy + dy
          if (x < 0 || x >= width || y < 0 || y >= height) continue
          const idx = y * width + x
          if (next[idx] === value) continue
          next[idx] = value
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [width, height])

  const fillAt = useCallback((cx, cy, value) => {
    setGrid(prev => {
      if (cx < 0 || cx >= width || cy < 0 || cy >= height) return prev
      const target = prev[cy * width + cx]
      if (target === value) return prev
      const next = new Uint8Array(prev)
      const stack = [[cx, cy]]
      while (stack.length) {
        const [x, y] = stack.pop()
        if (x < 0 || x >= width || y < 0 || y >= height) continue
        const idx = y * width + x
        if (next[idx] !== target) continue
        next[idx] = value
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1])
      }
      return next
    })
  }, [width, height])

  const fillRect = useCallback((a, b, value) => {
    setGrid(prev => {
      const next = new Uint8Array(prev)
      let changed = false
      const x0 = Math.max(0, Math.min(a.x, b.x))
      const y0 = Math.max(0, Math.min(a.y, b.y))
      const x1 = Math.min(width - 1, Math.max(a.x, b.x))
      const y1 = Math.min(height - 1, Math.max(a.y, b.y))
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const idx = y * width + x
          if (next[idx] === value) continue
          next[idx] = value
          changed = true
        }
      }
      return changed ? next : prev
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
    setManualTiles(new Int16Array(width * height).fill(-1))
  }, [width, height])

  // ── Placed props ──────────────────────────────────────────────────────────
  const addProp = useCallback((assetId, x, y) => {
    const id = (crypto?.randomUUID?.() ?? String(Date.now() + Math.random()))
    setPlacedProps(prev => [...prev, { id, assetId, x, y }])
  }, [])

  const removeProp = useCallback((id) => {
    setPlacedProps(prev => prev.filter(p => p.id !== id))
  }, [])

  const clearProps = useCallback(() => setPlacedProps([]), [])

  // Replace the whole level (loading a saved one)
  const loadState = useCallback(({ width: w, height: h, grid: g, placedProps: pp, manualTiles: mt }) => {
    setWidth(w)
    setHeight(h)
    setGrid(g instanceof Uint8Array ? g : new Uint8Array(g))
    setManualTiles(mt instanceof Int16Array ? mt : new Int16Array(w * h).fill(-1))
    setPlacedProps(Array.isArray(pp) ? pp : [])
  }, [])

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
    setManualTiles(prev => {
      const next = new Int16Array(w * h).fill(-1)
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
    width, height, grid, manualTiles, seamlessEdges, setSeamlessEdges,
    startPaint, continuePaint, generate, clear, fillAll, resize,
    getCell, paintArea, fillAt, fillRect,
    getManualTile, paintManualArea, fillManualAt, fillManualRect, clearManualTiles, clearManualArea, clearManualFill, clearManualRect,
    placedProps, addProp, removeProp, clearProps,
    loadState,
  }
}

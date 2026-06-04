import { useState, useCallback, useRef } from 'react'
import { createGrid } from '../core/autotile.js'
import { GENERATORS } from '../core/levelGenerator.js'

let _lid = 0
function makeLayer(name, w, h, tileset = null, kind = 'autotile') {
  return {
    id: `layer-${++_lid}`,
    name,
    kind,
    visible: true,
    tileset,
    grid: createGrid(w, h),
    manualTiles: new Int16Array(w * h).fill(-1),
  }
}

export function useLevelMap(initialW = 32, initialH = 20) {
  const [width, setWidth]   = useState(initialW)
  const [height, setHeight] = useState(initialH)
  const [layers, setLayers] = useState(() => [makeLayer('Layer 1', initialW, initialH)])
  const [activeLayerIdx, setActiveLayerIdx] = useState(0)
  const [seamlessEdges, setSeamlessEdges] = useState(false)
  const [placedProps, setPlacedProps] = useState([])

  const paintValue = useRef(1)
  const wRef  = useRef(initialW)
  const hRef  = useRef(initialH)
  const aiRef = useRef(0)
  const lRef  = useRef(layers)

  wRef.current  = width
  hRef.current  = height
  aiRef.current = activeLayerIdx
  if (lRef.current !== layers) lRef.current = layers

  // ── RAF-batched stroke buffer ──────────────────────────────────────────────
  // Paint operations write here instead of calling setLayers on every mousemove.
  // A requestAnimationFrame flushes the buffer to React state (≤60fps),
  // keeping the render cycle fast regardless of mouse-move frequency.
  const strokeBuf = useRef(null)  // { layerIdx, grid, manualTiles?, dirtyTerrain:Set, dirtyManual:Set }
  const strokeRaf = useRef(null)

  const flushStroke = useCallback(() => {
    strokeRaf.current = null
    const buf = strokeBuf.current
    if (!buf) return
    const { layerIdx, grid, manualTiles, dirtyTerrain, dirtyManual } = buf
    // Commit snapshot copies to React state; buf stays mutable for ongoing stroke
    const gridSnap = new Uint8Array(grid)
    const mtSnap   = manualTiles ? new Int16Array(manualTiles) : undefined
    setLayers(prev => prev.map((l, i) =>
      i === layerIdx ? {
        ...l,
        grid: gridSnap,
        ...(mtSnap ? { manualTiles: mtSnap } : {}),
        _dirtyTerrain: dirtyTerrain?.size ? Array.from(dirtyTerrain) : null,
        _dirtyManual: dirtyManual?.size ? Array.from(dirtyManual) : null,
      } : l
    ))
  }, [])

  const scheduleFlush = useCallback(() => {
    if (!strokeRaf.current) strokeRaf.current = requestAnimationFrame(flushStroke)
  }, [flushStroke])

  const discardStrokeBuffer = useCallback(() => {
    if (strokeRaf.current) {
      cancelAnimationFrame(strokeRaf.current)
      strokeRaf.current = null
    }
    strokeBuf.current = null
  }, [])

  // Returns the mutable grid buffer for the active layer (lazy-init).
  const ensureGridBuf = useCallback((layerIdx) => {
    if (strokeBuf.current?.layerIdx !== layerIdx) {
      const layer = lRef.current[layerIdx]
      strokeBuf.current = {
        layerIdx,
        grid: layer ? new Uint8Array(layer.grid) : new Uint8Array(wRef.current * hRef.current),
        manualTiles: undefined,
        dirtyTerrain: new Set(),
        dirtyManual: new Set(),
      }
    }
    return strokeBuf.current.grid
  }, [])

  // Called on mouseup to commit remaining paint immediately (no frame delay).
  const endStroke = useCallback(() => {
    if (strokeRaf.current) { cancelAnimationFrame(strokeRaf.current); flushStroke() }
    strokeBuf.current = null
  }, [flushStroke])

  // ── One-shot patch (for fill/rect/generate/clear — not during drag) ────────
  const patchActive = useCallback((patchFn) => {
    discardStrokeBuffer()
    setLayers(prev => {
      const idx = aiRef.current
      const layer = prev[idx]
      if (!layer) return prev
      const patch = patchFn(layer)
      if (!patch) return prev
      return prev.map((l, i) => i === idx ? {
        ...l,
        _dirtyTerrain: null,
        _dirtyManual: null,
        ...patch,
      } : l)
    })
  }, [discardStrokeBuffer])

  // ── Layer CRUD ─────────────────────────────────────────────────────────────
  const addLayer = useCallback((tileset = null, kind = 'autotile') => {
    discardStrokeBuffer()
    const newIdx = lRef.current.length
    setLayers(prev => {
      const w = wRef.current, h = hRef.current
      const label = kind === 'manual' ? 'Layer' : 'Autotile'
      return [...prev, makeLayer(`${label} ${prev.length + 1}`, w, h, tileset, kind)]
    })
    setActiveLayerIdx(newIdx)
  }, [discardStrokeBuffer])

  const removeLayer = useCallback((idx) => {
    discardStrokeBuffer()
    setLayers(prev => prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx))
    setActiveLayerIdx(prev => (prev >= idx && prev > 0) ? prev - 1 : prev)
  }, [discardStrokeBuffer])

  const setLayerProp = useCallback((idx, props) => {
    setLayers(prev => prev.map((l, i) => i === idx ? { ...l, ...props } : l))
  }, [])

  const setLayerName = useCallback((idx, name) => {
    setLayers(prev => prev.map((l, i) => i === idx ? { ...l, name } : l))
  }, [])

  // ── Terrain paint — buffered, flush via RAF ────────────────────────────────
  const paintArea = useCallback((cx, cy, value, brushSize = 1) => {
    const w = wRef.current, h = hRef.current
    const grid = ensureGridBuf(aiRef.current)
    const r = Math.max(0, brushSize - 1)
    let changed = false
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx, y = cy + dy
        if (x < 0 || x >= w || y < 0 || y >= h) continue
        if (grid[y * w + x] === value) continue
        const cell = y * w + x
        grid[cell] = value
        strokeBuf.current?.dirtyTerrain?.add(cell)
        changed = true
      }
    }
    if (changed) scheduleFlush()
  }, [ensureGridBuf, scheduleFlush])

  const fillAt = useCallback((cx, cy, value) => {
    const w = wRef.current, h = hRef.current
    patchActive(layer => {
      if (cx < 0 || cx >= w || cy < 0 || cy >= h) return null
      const target = layer.grid[cy * w + cx]
      if (target === value) return null
      const next = new Uint8Array(layer.grid)
      const stack = [[cx, cy]]
      while (stack.length) {
        const [x, y] = stack.pop()
        if (x < 0 || x >= w || y < 0 || y >= h) continue
        if (next[y * w + x] !== target) continue
        next[y * w + x] = value
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1])
      }
      return { grid: next }
    })
  }, [patchActive])

  const fillRect = useCallback((a, b, value) => {
    const w = wRef.current, h = hRef.current
    patchActive(layer => {
      const next = new Uint8Array(layer.grid)
      let changed = false
      const x0 = Math.max(0, Math.min(a.x, b.x)), y0 = Math.max(0, Math.min(a.y, b.y))
      const x1 = Math.min(w - 1, Math.max(a.x, b.x)), y1 = Math.min(h - 1, Math.max(a.y, b.y))
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (next[y * w + x] === value) continue
          next[y * w + x] = value
          changed = true
        }
      }
      return changed ? { grid: next } : null
    })
  }, [patchActive])

  const getCell = useCallback((x, y) => {
    const layer = lRef.current[aiRef.current]
    if (!layer || x < 0 || x >= wRef.current || y < 0 || y >= hRef.current) return 0
    // Check stroke buffer first for live state
    const buf = strokeBuf.current
    if (buf?.layerIdx === aiRef.current) return buf.grid[y * wRef.current + x]
    return layer.grid[y * wRef.current + x]
  }, [])

  // ── Manual tiles — buffered, flush via RAF ─────────────────────────────────
  const ensureManualBuf = useCallback((layerIdx) => {
    ensureGridBuf(layerIdx)  // grid buffer must exist first
    const buf = strokeBuf.current
    if (!buf.manualTiles) {
      const layer = lRef.current[layerIdx]
      buf.manualTiles = layer
        ? new Int16Array(layer.manualTiles)
        : new Int16Array(wRef.current * hRef.current).fill(-1)
    }
    return buf.manualTiles
  }, [ensureGridBuf])

  const paintManualArea = useCallback((cx, cy, tileIndex, brushSize = 1) => {
    const w = wRef.current, h = hRef.current
    const mt = ensureManualBuf(aiRef.current)
    const r = Math.max(0, brushSize - 1)
    let changed = false
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx, y = cy + dy
        if (x < 0 || x >= w || y < 0 || y >= h) continue
        if (mt[y * w + x] === tileIndex) continue
        const cell = y * w + x
        mt[cell] = tileIndex
        strokeBuf.current?.dirtyManual?.add(cell)
        changed = true
      }
    }
    if (changed) scheduleFlush()
  }, [ensureManualBuf, scheduleFlush])

  const fillManualAt = useCallback((cx, cy, tileIndex) => {
    const w = wRef.current, h = hRef.current
    patchActive(layer => {
      if (cx < 0 || cx >= w || cy < 0 || cy >= h) return null
      const target = layer.manualTiles[cy * w + cx]
      if (target === tileIndex) return null
      const next = new Int16Array(layer.manualTiles)
      const stack = [[cx, cy]]
      while (stack.length) {
        const [x, y] = stack.pop()
        if (x < 0 || x >= w || y < 0 || y >= h) continue
        if (next[y * w + x] !== target) continue
        next[y * w + x] = tileIndex
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1])
      }
      return { manualTiles: next }
    })
  }, [patchActive])

  const fillManualRect = useCallback((a, b, tileIndex) => {
    const w = wRef.current, h = hRef.current
    patchActive(layer => {
      const next = new Int16Array(layer.manualTiles)
      let changed = false
      const x0 = Math.max(0, Math.min(a.x, b.x)), y0 = Math.max(0, Math.min(a.y, b.y))
      const x1 = Math.min(w - 1, Math.max(a.x, b.x)), y1 = Math.min(h - 1, Math.max(a.y, b.y))
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (next[y * w + x] === tileIndex) continue
          next[y * w + x] = tileIndex
          changed = true
        }
      }
      return changed ? { manualTiles: next } : null
    })
  }, [patchActive])

  const clearManualArea   = useCallback((cx, cy, bs) => paintManualArea(cx, cy, -1, bs), [paintManualArea])
  const clearManualFill   = useCallback((cx, cy) => fillManualAt(cx, cy, -1), [fillManualAt])
  const clearManualRect   = useCallback((a, b) => fillManualRect(a, b, -1), [fillManualRect])

  const clearManualTiles = useCallback(() => {
    const w = wRef.current, h = hRef.current
    patchActive(() => ({
      grid: createGrid(w, h),
      manualTiles: new Int16Array(w * h).fill(-1),
    }))
  }, [patchActive])

  const fillManualAll = useCallback((tileIndex) => {
    const w = wRef.current, h = hRef.current
    patchActive(() => ({
      grid: createGrid(w, h),
      manualTiles: new Int16Array(w * h).fill(tileIndex),
    }))
  }, [patchActive])

  const getManualTile = useCallback((x, y) => {
    const layer = lRef.current[aiRef.current]
    if (!layer || x < 0 || x >= wRef.current || y < 0 || y >= hRef.current) return -1
    const buf = strokeBuf.current
    if (buf?.layerIdx === aiRef.current && buf.manualTiles) return buf.manualTiles[y * wRef.current + x]
    return layer.manualTiles[y * wRef.current + x]
  }, [])

  // ── startPaint / continuePaint (autotile click-drag) ──────────────────────
  const startPaint = useCallback((x, y, erase) => {
    paintValue.current = erase ? 0 : 1
    paintArea(x, y, paintValue.current)
  }, [paintArea])

  const continuePaint = useCallback((x, y) => {
    paintArea(x, y, paintValue.current)
  }, [paintArea])

  // ── Generate / Clear / Fill (active layer, one-shot) ──────────────────────
  const generate = useCallback((type, opts = {}) => {
    const gen = GENERATORS[type]
    if (!gen) return
    const w = wRef.current, h = hRef.current
    const nextGrid = gen.fn(w, h, opts)
    patchActive(() => ({ grid: nextGrid, manualTiles: new Int16Array(w * h).fill(-1) }))
  }, [patchActive])

  const clear = useCallback(() => {
    const w = wRef.current, h = hRef.current
    patchActive(() => ({ grid: createGrid(w, h), manualTiles: new Int16Array(w * h).fill(-1) }))
  }, [patchActive])

  const fillAll = useCallback(() => {
    const w = wRef.current, h = hRef.current
    patchActive(() => ({ grid: createGrid(w, h, 1) }))
  }, [patchActive])

  // ── Resize (all layers) ────────────────────────────────────────────────────
  const resize = useCallback((w, h) => {
    discardStrokeBuffer()
    const oldW = wRef.current, oldH = hRef.current
    setWidth(w); setHeight(h)
    setLayers(prev => prev.map(layer => {
      const nextGrid = createGrid(w, h)
      const nextMT   = new Int16Array(w * h).fill(-1)
      const copyW = Math.min(w, oldW), copyH = Math.min(h, oldH)
      for (let y = 0; y < copyH; y++) {
        for (let x = 0; x < copyW; x++) {
          nextGrid[y * w + x] = layer.grid[y * oldW + x]
          nextMT[y * w + x]   = layer.manualTiles[y * oldW + x]
        }
      }
      return { ...layer, grid: nextGrid, manualTiles: nextMT }
    }))
  }, [discardStrokeBuffer])

  // ── Props ──────────────────────────────────────────────────────────────────
  const addProp = useCallback((assetId, x, y) => {
    const id = crypto?.randomUUID?.() ?? String(Date.now() + Math.random())
    setPlacedProps(prev => [...prev, { id, assetId, x, y }])
  }, [])
  const removeProp = useCallback((id) => setPlacedProps(prev => prev.filter(p => p.id !== id)), [])
  const clearProps = useCallback(() => setPlacedProps([]), [])

  // ── Load saved level ───────────────────────────────────────────────────────
  const loadState = useCallback(({ width: w, height: h, layers: ls, placedProps: pp }) => {
    discardStrokeBuffer()
    setWidth(w); setHeight(h)
    setLayers(Array.isArray(ls) && ls.length > 0 ? ls : [makeLayer('Layer 1', w, h)])
    setActiveLayerIdx(0)
    setPlacedProps(Array.isArray(pp) ? pp : [])
  }, [discardStrokeBuffer])

  return {
    width, height,
    layers, activeLayerIdx, setActiveLayerIdx,
    addLayer, removeLayer, setLayerProp, setLayerName,
    seamlessEdges, setSeamlessEdges,
    startPaint, continuePaint, endStroke,
    generate, clear, fillAll, resize,
    getCell, paintArea, fillAt, fillRect,
    getManualTile, paintManualArea, fillManualAt, fillManualRect,
    clearManualTiles, clearManualArea, clearManualFill, clearManualRect, fillManualAll,
    placedProps, addProp, removeProp, clearProps,
    loadState,
  }
}

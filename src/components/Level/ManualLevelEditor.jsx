import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { Section } from '../ui/Section.jsx'
import { Segmented } from '../ui/Segmented.jsx'
import { Btn } from '../ui/Btn.jsx'
import { PixIcon } from '../ui/PixIcon.jsx'
import { ICONS } from '../ui/icons.js'
import { Minimap } from './Minimap.jsx'
import { composeNativeSheet } from '../../core/composeSheet.js'

const MAP_PRESETS = [
  { label: 'S', name: 'Small',  w: 20, h: 13 },
  { label: 'M', name: 'Medium', w: 30, h: 18 },
  { label: 'L', name: 'Large',  w: 44, h: 26 },
]
const ZOOMS = [14, 20, 28, 40]
const TILE_COLS = 8, TILE_ROWS = 6
const STORE_KEY = 'ts_manual_level_v1'

const TOOLS = [
  { id: 'brush',  icon: 'brush',  label: 'Brush',  key: 'B' },
  { id: 'fill',   icon: 'bucket', label: 'Fill',   key: 'G' },
  { id: 'eraser', icon: 'eraser', label: 'Eraser', key: 'E' },
  { id: 'picker', icon: 'picker', label: 'Picker', key: 'I' },
  { id: 'rect',   icon: 'rect',   label: 'Rect',   key: 'R' },
]

const emptyData = (n) => new Array(n).fill(-1)

// Manual multi-layer tile painter using the real composed tilesheet.
export function ManualLevelEditor({ tiles, tileSize }) {
  const native = useMemo(() => composeNativeSheet(tiles, tileSize), [tiles, tileSize])

  const [preset, setPreset] = useState(1)
  const dims = MAP_PRESETS[preset]
  const [tool, setTool] = useState('brush')
  const [brushSize, setBrushSize] = useState(1)
  const [selected, setSelected] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [showGrid, setShowGrid] = useState(true)
  const [activeLayer, setActiveLayer] = useState(0)
  const [layersMeta, setLayersMeta] = useState([
    { name: 'Ground', visible: true }, { name: 'Decor', visible: true },
  ])
  const [, bump] = useState(0)
  const cellPx = ZOOMS[zoom]

  const layersRef = useRef(null)
  const undoRef = useRef([])
  const redoRef = useRef([])
  const mapRef = useRef(null)
  const paletteRef = useRef(null)
  const dragRef = useRef(null)

  // init / load layers when dims change
  useEffect(() => {
    const n = dims.w * dims.h
    let loaded = null
    try {
      const raw = localStorage.getItem(STORE_KEY)
      if (raw) {
        const p = JSON.parse(raw)
        if (p.w === dims.w && p.h === dims.h && Array.isArray(p.layers)) loaded = p.layers
      }
    } catch (e) {}
    layersRef.current = loaded
      ? loaded.map((d) => ({ data: d.slice(0, n).concat(emptyData(Math.max(0, n - d.length))) }))
      : [{ data: emptyData(n) }, { data: emptyData(n) }]
    undoRef.current = []; redoRef.current = []
    bump((v) => v + 1)
  }, [preset]) // eslint-disable-line

  const persist = useCallback(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ w: dims.w, h: dims.h, layers: layersRef.current.map((l) => l.data) }))
    } catch (e) {}
  }, [dims])

  // draw the map
  const redraw = useCallback(() => {
    const cv = mapRef.current; if (!cv || !layersRef.current) return
    const W = dims.w * cellPx, H = dims.h * cellPx
    cv.width = W; cv.height = H
    const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false
    ctx.fillStyle = '#0a0d12'; ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#0e1218'
    for (let y = 0; y < dims.h; y++) for (let x = 0; x < dims.w; x++) if ((x + y) % 2) ctx.fillRect(x * cellPx, y * cellPx, cellPx, cellPx)
    layersRef.current.forEach((layer, li) => {
      if (!layersMeta[li].visible) return
      const d = layer.data
      for (let y = 0; y < dims.h; y++) for (let x = 0; x < dims.w; x++) {
        const idx = d[y * dims.w + x]
        if (idx < 0) continue
        const sx = (idx % TILE_COLS) * tileSize, sy = Math.floor(idx / TILE_COLS) * tileSize
        ctx.drawImage(native, sx, sy, tileSize, tileSize, x * cellPx, y * cellPx, cellPx, cellPx)
      }
    })
    if (showGrid) {
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1; ctx.beginPath()
      for (let x = 0; x <= dims.w; x++) { ctx.moveTo(x * cellPx + .5, 0); ctx.lineTo(x * cellPx + .5, H) }
      for (let y = 0; y <= dims.h; y++) { ctx.moveTo(0, y * cellPx + .5); ctx.lineTo(W, y * cellPx + .5) }
      ctx.stroke()
    }
    const dr = dragRef.current
    if (dr && tool === 'rect' && dr.cur) {
      const x0 = Math.min(dr.start.x, dr.cur.x), y0 = Math.min(dr.start.y, dr.cur.y)
      const x1 = Math.max(dr.start.x, dr.cur.x), y1 = Math.max(dr.start.y, dr.cur.y)
      const acc = getComputedStyle(document.querySelector('.app')).getPropertyValue('--accent') || '#2fd6a6'
      ctx.strokeStyle = acc.trim(); ctx.lineWidth = 2
      ctx.strokeRect(x0 * cellPx + 1, y0 * cellPx + 1, (x1 - x0 + 1) * cellPx - 2, (y1 - y0 + 1) * cellPx - 2)
    }
  }, [dims, cellPx, native, tileSize, showGrid, layersMeta, tool])

  useEffect(() => { redraw() }, [redraw])

  // palette (tile picker)
  useEffect(() => {
    const cv = paletteRef.current; if (!cv) return
    const pc = 28
    cv.width = TILE_COLS * pc; cv.height = TILE_ROWS * pc
    const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false
    ctx.drawImage(native, 0, 0, native.width, native.height, 0, 0, cv.width, cv.height)
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    for (let x = 0; x <= TILE_COLS; x++) { ctx.beginPath(); ctx.moveTo(x * pc + .5, 0); ctx.lineTo(x * pc + .5, cv.height); ctx.stroke() }
    for (let y = 0; y <= TILE_ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y * pc + .5); ctx.lineTo(cv.width, y * pc + .5); ctx.stroke() }
    const sx = (selected % TILE_COLS) * pc, sy = Math.floor(selected / TILE_COLS) * pc
    const acc = getComputedStyle(document.querySelector('.app')).getPropertyValue('--accent') || '#2fd6a6'
    ctx.strokeStyle = acc.trim(); ctx.lineWidth = 3
    ctx.strokeRect(sx + 1.5, sy + 1.5, pc - 3, pc - 3)
  }, [native, selected])

  const pickFromPalette = (e) => {
    const cv = paletteRef.current; const r = cv.getBoundingClientRect()
    const pc = r.width / TILE_COLS
    const cx = Math.floor((e.clientX - r.left) / pc), cy = Math.floor((e.clientY - r.top) / pc)
    if (cx >= 0 && cy >= 0 && cx < TILE_COLS && cy < TILE_ROWS) setSelected(cy * TILE_COLS + cx)
  }

  // editing
  const snapshot = () => {
    undoRef.current.push(layersRef.current.map((l) => l.data.slice()))
    if (undoRef.current.length > 40) undoRef.current.shift()
    redoRef.current = []
  }
  const applyBrush = (cx, cy) => {
    const d = layersRef.current[activeLayer].data
    const r = brushSize - 1
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx, y = cy + dy
      if (x < 0 || y < 0 || x >= dims.w || y >= dims.h) continue
      d[y * dims.w + x] = tool === 'eraser' ? -1 : selected
    }
  }
  const floodFill = (cx, cy) => {
    const d = layersRef.current[activeLayer].data
    const target = d[cy * dims.w + cx]
    if (target === selected) return
    const stack = [[cx, cy]]
    while (stack.length) {
      const [x, y] = stack.pop()
      if (x < 0 || y < 0 || x >= dims.w || y >= dims.h) continue
      if (d[y * dims.w + x] !== target) continue
      d[y * dims.w + x] = selected
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1])
    }
  }
  const fillRect = (a, b) => {
    const d = layersRef.current[activeLayer].data
    const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y), x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y)
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) d[y * dims.w + x] = selected
  }

  const cellFromEvent = (e) => {
    const r = mapRef.current.getBoundingClientRect()
    const sx = mapRef.current.width / r.width
    return { x: Math.floor(((e.clientX - r.left) * sx) / cellPx), y: Math.floor(((e.clientY - r.top) * sx) / cellPx) }
  }
  const onDown = (e) => {
    const c = cellFromEvent(e)
    if (c.x < 0 || c.y < 0 || c.x >= dims.w || c.y >= dims.h) return
    if (tool === 'picker') {
      for (let li = layersRef.current.length - 1; li >= 0; li--) {
        const v = layersRef.current[li].data[c.y * dims.w + c.x]
        if (v >= 0) { setSelected(v); return }
      }
      return
    }
    snapshot()
    if (tool === 'fill') { floodFill(c.x, c.y); redraw(); bump((v) => v + 1); persist(); return }
    if (tool === 'rect') { dragRef.current = { start: c, cur: c, mode: 'rect' }; redraw(); return }
    dragRef.current = { mode: 'paint' }
    applyBrush(c.x, c.y); redraw()
  }
  const onMove = (e) => {
    if (!dragRef.current) return
    const c = cellFromEvent(e)
    if (c.x < 0 || c.y < 0 || c.x >= dims.w || c.y >= dims.h) return
    if (dragRef.current.mode === 'paint') { applyBrush(c.x, c.y); redraw() }
    else if (dragRef.current.mode === 'rect') { dragRef.current.cur = c; redraw() }
  }
  const onUp = () => {
    if (!dragRef.current) return
    if (dragRef.current.mode === 'rect' && dragRef.current.cur) fillRect(dragRef.current.start, dragRef.current.cur)
    dragRef.current = null
    redraw(); bump((v) => v + 1); persist()
  }

  const undo = () => {
    if (!undoRef.current.length) return
    redoRef.current.push(layersRef.current.map((l) => l.data.slice()))
    const snap = undoRef.current.pop()
    layersRef.current.forEach((l, i) => l.data = snap[i].slice())
    redraw(); bump((v) => v + 1); persist()
  }
  const redo = () => {
    if (!redoRef.current.length) return
    undoRef.current.push(layersRef.current.map((l) => l.data.slice()))
    const snap = redoRef.current.pop()
    layersRef.current.forEach((l, i) => l.data = snap[i].slice())
    redraw(); bump((v) => v + 1); persist()
  }
  const clearLayer = () => {
    snapshot()
    layersRef.current[activeLayer].data = emptyData(dims.w * dims.h)
    redraw(); bump((v) => v + 1); persist()
  }

  const exportPNG = () => {
    const out = document.createElement('canvas')
    out.width = dims.w * tileSize; out.height = dims.h * tileSize
    const ctx = out.getContext('2d'); ctx.imageSmoothingEnabled = false
    layersRef.current.forEach((layer, li) => {
      if (!layersMeta[li].visible) return
      const d = layer.data
      for (let y = 0; y < dims.h; y++) for (let x = 0; x < dims.w; x++) {
        const idx = d[y * dims.w + x]; if (idx < 0) continue
        const sx = (idx % TILE_COLS) * tileSize, sy = Math.floor(idx / TILE_COLS) * tileSize
        ctx.drawImage(native, sx, sy, tileSize, tileSize, x * tileSize, y * tileSize, tileSize, tileSize)
      }
    })
    const a = document.createElement('a')
    a.href = out.toDataURL('image/png'); a.download = `level_${dims.w}x${dims.h}.png`; a.click()
  }

  const toggleVis = (i) => setLayersMeta((m) => m.map((l, j) => j === i ? { ...l, visible: !l.visible } : l))

  // keyboard shortcuts
  useEffect(() => {
    const h = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return }
      const map = { b: 'brush', g: 'fill', e: 'eraser', i: 'picker', r: 'rect' }
      if (map[e.key]) setTool(map[e.key])
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  const painted = layersRef.current ? layersRef.current.reduce((s, l) => s + l.data.filter((v) => v >= 0).length, 0) : 0
  const getIndex = (x, y) => {
    if (!layersRef.current) return -1
    for (let li = layersRef.current.length - 1; li >= 0; li--) {
      if (!layersMeta[li].visible) continue
      const v = layersRef.current[li].data[y * dims.w + x]
      if (v >= 0) return v
    }
    return -1
  }
  const activeTool = TOOLS.find((x) => x.id === tool)

  return (
    <div className="editor-grid">
      {/* LEFT: tools + tiles */}
      <aside className="panel">
        <div className="panel-scroll">
          <Section title="Tools" icon="brush">
            <div className="tool-grid">
              {TOOLS.map((tl) => (
                <button key={tl.id} className={`tool-btn ${tool === tl.id ? 'on' : ''}`} onClick={() => setTool(tl.id)} title={`${tl.label} (${tl.key})`}>
                  <PixIcon grid={ICONS[tl.icon]} px={2.5} color={tool === tl.id ? 'var(--accent-ink)' : 'var(--ink-dim)'} />
                  <span>{tl.label}</span>
                </button>
              ))}
            </div>
            <label className="field-label">Brush size</label>
            <Segmented full size="sm" value={brushSize} onChange={setBrushSize}
              options={[{ value: 1, label: '1×1' }, { value: 2, label: '3×3' }, { value: 3, label: '5×5' }]} />
          </Section>

          <Section title="Tiles" icon="grid">
            <div className="palette-wrap">
              <canvas ref={paletteRef} className="palette-canvas" onClick={pickFromPalette} />
            </div>
            <p className="hint">Click a tile to select it. Tile #{selected}.</p>
          </Section>
        </div>
      </aside>

      {/* CENTER: map */}
      <main className="stage">
        <div className="stage-toolbar">
          <span className="tool-active"><PixIcon grid={ICONS[activeTool.icon]} px={2} color="var(--accent)" /> {activeTool.label}</span>
          <div className="spacer" />
          <Segmented size="sm" value={preset} onChange={setPreset} options={MAP_PRESETS.map((p, i) => ({ value: i, label: p.label }))} />
          <span className="tool-meta">{dims.w}×{dims.h}</span>
          <button className={`icon-toggle ${showGrid ? 'on' : ''}`} onClick={() => setShowGrid(!showGrid)} title="Grid"><PixIcon grid={ICONS.grid} px={2} /></button>
          <div className="zoom-ctrl">
            <button onClick={() => setZoom((z) => Math.max(0, z - 1))}>−</button>
            <span>{cellPx}px</span>
            <button onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))}>+</button>
          </div>
        </div>

        <div className="stage-canvas map-scroll">
          <canvas ref={mapRef} className="map-canvas" onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} />
        </div>

        <div className="stage-actions">
          <Btn variant="outline" icon="undo" onClick={undo}>Undo</Btn>
          <Btn variant="outline" icon="redo" onClick={redo}>Redo</Btn>
          <Btn variant="danger" icon="trash" onClick={clearLayer}>Clear layer</Btn>
          <Btn variant="primary" size="lg" icon="download" onClick={exportPNG}>Export map PNG</Btn>
        </div>
      </main>

      {/* RIGHT: layers + minimap */}
      <aside className="panel">
        <div className="panel-scroll">
          <Section title="Layers" icon="layers">
            {layersMeta.map((l, i) => (
              <div key={l.name} className={`layer-row ${activeLayer === i ? 'on' : ''}`} onClick={() => setActiveLayer(i)}>
                <button className="layer-eye" onClick={(e) => { e.stopPropagation(); toggleVis(i) }} style={{ opacity: l.visible ? 1 : 0.3 }}>
                  <PixIcon grid={ICONS.eye} px={2} color={activeLayer === i ? 'var(--accent)' : 'var(--ink-dim)'} />
                </button>
                <span className="layer-name">{l.name}</span>
                {activeLayer === i && <span className="layer-active-tag">active</span>}
              </div>
            ))}
            <p className="hint">You paint on the active layer. Decor draws above Ground.</p>
          </Section>

          <Section title={`Minimap · ${dims.name}`} icon="image">
            <div className="mini-wrap"><Minimap width={dims.w} height={dims.h} getIndex={getIndex} nativeSheet={native} tileSize={tileSize} /></div>
            <div className="mini-stats">
              <div className="mini-stat"><b>{painted}</b><span>Tiles</span></div>
              <div className="mini-stat"><b>{dims.w * dims.h}</b><span>Cells</span></div>
              <div className="mini-stat"><b>{Math.round((painted / (dims.w * dims.h)) * 100)}%</b><span>Full</span></div>
            </div>
          </Section>
        </div>
      </aside>
    </div>
  )
}

import { useState, useMemo, useEffect, useRef } from 'react'
import { Segmented } from '../ui/Segmented.jsx'
import { Section } from '../ui/Section.jsx'
import { Btn } from '../ui/Btn.jsx'
import { LevelCanvas } from './LevelCanvas.jsx'
import { ManualLevelEditor } from './ManualLevelEditor.jsx'
import { Minimap } from './Minimap.jsx'
import { computeIndexMap } from '../../core/autotile.js'
import { composeNativeSheet } from '../../core/composeSheet.js'
import { GENERATORS } from '../../core/levelGenerator.js'

const SIZE_PRESETS = [
  { label: 'S', w: 24, h: 16 }, { label: 'M', w: 32, h: 20 },
  { label: 'L', w: 48, h: 28 }, { label: 'XL', w: 64, h: 40 },
]

// Small transparent-aware prop thumbnail for the picker.
function PropMini({ asset }) {
  const ref = useRef(null)
  const pxW = asset.cols * asset.tileSize, pxH = asset.rows * asset.tileSize
  useEffect(() => {
    const cv = ref.current; if (!cv) return
    const box = 52; cv.width = box; cv.height = box
    const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, box, box)
    const s = Math.min(box / pxW, box / pxH)
    const tmp = document.createElement('canvas'); tmp.width = pxW; tmp.height = pxH
    tmp.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(asset.pixels), pxW, pxH), 0, 0)
    ctx.drawImage(tmp, (box - pxW * s) / 2, (box - pxH * s) / 2, pxW * s, pxH * s)
  }, [asset, pxW, pxH])
  return <canvas ref={ref} />
}

export function LevelsWorkspace({
  levelMode, setLevelMode, level, tiles, tileSize,
  cellPx, setCellPx, showGrid, setShowGrid, onFit, levelCanvasAreaRef,
  levelTool, setLevelTool, assets, assetsById, selectedAssetId, onSelectAsset,
  onPlaceProp, onRemovePropAt, onSurprise,
  levels, onSaveLevel, onLoadLevel, onRemoveLevel,
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [saveName, setSaveName] = useState('')

  const native = useMemo(() => composeNativeSheet(tiles, tileSize), [tiles, tileSize])
  const indexMap = useMemo(
    () => computeIndexMap(level.grid, level.width, level.height, level.seamlessEdges ? 1 : 0),
    [level.grid, level.width, level.height, level.seamlessEdges]
  )

  const exportLevelPNG = () => {
    const out = document.createElement('canvas')
    out.width = level.width * tileSize; out.height = level.height * tileSize
    const ctx = out.getContext('2d'); ctx.imageSmoothingEnabled = false
    for (let y = 0; y < level.height; y++) for (let x = 0; x < level.width; x++) {
      const idx = indexMap[y * level.width + x]; if (!idx) continue
      const sx = (idx % 8) * tileSize, sy = Math.floor(idx / 8) * tileSize
      ctx.drawImage(native, sx, sy, tileSize, tileSize, x * tileSize, y * tileSize, tileSize, tileSize)
    }
    // placed props on top
    for (const p of level.placedProps) {
      const a = assetsById[p.assetId]; if (!a) continue
      const tmp = document.createElement('canvas'); tmp.width = a.cols * a.tileSize; tmp.height = a.rows * a.tileSize
      tmp.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(a.pixels), tmp.width, tmp.height), 0, 0)
      ctx.drawImage(tmp, p.x * tileSize, p.y * tileSize, a.cols * tileSize, a.rows * tileSize)
    }
    const link = document.createElement('a')
    link.href = out.toDataURL('image/png'); link.download = `level_${level.width}x${level.height}.png`; link.click()
  }

  // Manual mode renders its own full editor-grid
  const modeToggle = (
    <Segmented size="sm" value={levelMode} onChange={setLevelMode}
      options={[{ value: 'autotile', label: 'Autotile' }, { value: 'manual', label: 'Manual' }]} />
  )

  if (levelMode === 'manual') {
    return (
      <div className="levels-mode-wrap" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div className="stage-toolbar" style={{ margin: '14px 14px 0' }}>
          {modeToggle}
          <div className="spacer" />
          <span className="tool-meta">Manual painter · layers</span>
        </div>
        <ManualLevelEditor tiles={tiles} tileSize={tileSize} />
      </div>
    )
  }

  // ── Autotile mode ──
  return (
    <div className="editor-grid" style={{ gridTemplateColumns: sidebarOpen ? '286px minmax(0,1fr) 308px' : '0 minmax(0,1fr) 308px' }}>
      {/* LEFT */}
      <aside className="panel" style={{ display: sidebarOpen ? 'flex' : 'none' }}>
        <div className="panel-head">{modeToggle}</div>
        <div className="panel-scroll">
          <Section title="Tools" icon="brush">
            <Segmented full size="sm" value={levelTool} onChange={setLevelTool}
              options={[{ value: 'terrain', label: 'Terrain' }, { value: 'props', label: 'Props' }]} />
            <p className="hint">{levelTool === 'terrain' ? 'Left-click paints solid, right-click erases. Borders autotile.' : 'Pick a prop, click to place, right-click to remove.'}</p>
            {levelTool === 'props' && (
              <div className="prop-picker" style={{ marginTop: 10 }}>
                {assets.length === 0
                  ? <p className="hint">No props yet. Create them in the Assets view.</p>
                  : (
                    <div className="prop-grid">
                      {assets.map(a => (
                        <button key={a.id} className={`prop-card checker-bg ${selectedAssetId === a.id ? 'selected' : ''}`} onClick={() => onSelectAsset(a.id)} title={`${a.name} · ${a.cols}×${a.rows}`}>
                          <PropMini asset={a} />
                        </button>
                      ))}
                    </div>
                  )}
                <Btn size="sm" variant="outline" icon="trash" full style={{ marginTop: 8 }} onClick={level.clearProps} disabled={!level.placedProps.length}>
                  Clear props ({level.placedProps.length})
                </Btn>
              </div>
            )}
          </Section>

          <Section title="Map size" icon="grid">
            <div className="size-selector-row">
              {SIZE_PRESETS.map(p => (
                <button key={p.label} className={`size-cell-btn ${level.width === p.w && level.height === p.h ? 'active' : ''}`}
                  style={{ width: 'auto', padding: '0 10px', height: 28 }} onClick={() => level.resize(p.w, p.h)}>{p.label}</button>
              ))}
            </div>
            <div className="export-info"><span>Grid</span><b>{level.width} × {level.height}</b></div>
            <div className="row-btns">
              <Btn size="sm" variant="outline" icon="fit" full onClick={onFit}>Fit</Btn>
            </div>
          </Section>

          <Section title="Generate" icon="spark">
            <div className="tool-grid">
              {Object.entries(GENERATORS).map(([key, g]) => (
                <button key={key} className="tool-btn" onClick={() => level.generate(key)} title={g.label || key}>
                  <span>{g.label || key}</span>
                </button>
              ))}
            </div>
            <div className="row-btns">
              <Btn size="sm" variant="accentSoft" icon="dice" full onClick={onSurprise}>Surprise</Btn>
            </div>
            <div className="row-btns">
              <Btn size="sm" variant="outline" icon="grid" full onClick={level.fillAll}>Fill</Btn>
              <Btn size="sm" variant="danger" icon="trash" full onClick={level.clear}>Clear</Btn>
            </div>
          </Section>

          <Section title="Options" icon="layers" defaultOpen={false}>
            <label className="lib-card-foot" style={{ padding: '6px 0', cursor: 'pointer' }}>
              <span className="layer-name">Show grid</span>
              <input type="checkbox" checked={showGrid} onChange={e => setShowGrid(e.target.checked)} />
            </label>
            <label className="lib-card-foot" style={{ padding: '6px 0', cursor: 'pointer' }}>
              <span className="layer-name">Seamless edges</span>
              <input type="checkbox" checked={level.seamlessEdges} onChange={e => level.setSeamlessEdges(e.target.checked)} />
            </label>
          </Section>

          <Section title="Save / load level" icon="download" defaultOpen={false}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="text-input" value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="Level name" />
              <Btn variant="primary" size="sm" icon="save" onClick={() => { onSaveLevel(saveName.trim() || 'Level'); setSaveName('') }}>Save</Btn>
            </div>
            {levels.length === 0 ? <p className="hint">No saved levels yet.</p> : (
              <div style={{ marginTop: 8 }}>
                {levels.map(row => (
                  <div key={row.id} className="layer-row" onClick={() => onLoadLevel(row)}>
                    <span className="layer-name">{row.name}</span>
                    <span className="tool-meta">{row.width}×{row.height}</span>
                    <button className="lib-card-del" onClick={(e) => { e.stopPropagation(); onRemoveLevel(row.id) }}>×</button>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      </aside>

      {/* CENTER */}
      <section className="level-canvas-area" ref={levelCanvasAreaRef}>
        <div className="level-status-bar">
          <span className="level-status-pill">Map {level.width}×{level.height}</span>
          <span className="level-status-pill">Zoom {cellPx}px</span>
          <span className="level-status-pill">Props {level.placedProps.length}</span>
        </div>
        <button className="sidebar-toggle" onClick={() => setSidebarOpen(o => !o)} title={sidebarOpen ? 'Hide panel' : 'Show panel'}>
          {sidebarOpen ? '⟨' : '⟩'}
        </button>
        {tiles ? (
          <LevelCanvas
            grid={level.grid} width={level.width} height={level.height}
            tiles={tiles} tileSize={tileSize} cellPx={cellPx} setCellPx={setCellPx}
            seamlessEdges={level.seamlessEdges} showGrid={showGrid}
            onStartPaint={level.startPaint} onContinuePaint={level.continuePaint} onEndPaint={() => {}}
            levelTool={levelTool} placedProps={level.placedProps} assetsById={assetsById}
            selectedAssetId={selectedAssetId} onPlaceProp={onPlaceProp} onRemovePropAt={onRemovePropAt}
          />
        ) : <div className="level-empty">Generate a tileset first in the Editor view.</div>}
      </section>

      {/* RIGHT */}
      <aside className="panel">
        <div className="panel-scroll">
          <Section title="Minimap" icon="image">
            <div className="mini-wrap">
              <Minimap width={level.width} height={level.height} tileSize={tileSize} nativeSheet={native}
                getIndex={(x, y) => indexMap[y * level.width + x]} />
            </div>
            <div className="mini-stats">
              <div className="mini-stat"><b>{level.width * level.height}</b><span>Cells</span></div>
              <div className="mini-stat"><b>{level.placedProps.length}</b><span>Props</span></div>
              <div className="mini-stat"><b>{tileSize}px</b><span>Tile</span></div>
            </div>
          </Section>
          <Section title="Export" icon="download">
            <div className="export-info"><span>Output</span><b>{level.width * tileSize} × {level.height * tileSize}px</b></div>
            <Btn variant="primary" icon="download" full style={{ marginTop: 10 }} onClick={exportLevelPNG}>Export level PNG</Btn>
          </Section>
        </div>
      </aside>
    </div>
  )
}

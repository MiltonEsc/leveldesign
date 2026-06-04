import { useState, useMemo, useEffect, useRef } from 'react'
import { Segmented } from '../ui/Segmented.jsx'
import { Section } from '../ui/Section.jsx'
import { Btn } from '../ui/Btn.jsx'
import { LevelCanvas } from './LevelCanvas.jsx'
import { Minimap } from './Minimap.jsx'
import { computeIndexMap } from '../../core/autotile.js'
import { composeNativeSheet } from '../../core/composeSheet.js'
import { GENERATORS } from '../../core/levelGenerator.js'
import { PixIcon } from '../ui/PixIcon.jsx'
import { ICONS } from '../ui/icons.js'

const SIZE_PRESETS = [
  { label: 'S', w: 24, h: 16 },
  { label: 'M', w: 32, h: 20 },
  { label: 'L', w: 48, h: 28 },
  { label: 'XL', w: 64, h: 40 },
]

function PropMini({ asset }) {
  const ref = useRef(null)
  const pxW = asset.cols * asset.tileSize
  const pxH = asset.rows * asset.tileSize
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const box = 52
    cv.width = box
    cv.height = box
    const ctx = cv.getContext('2d')
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, box, box)
    const s = Math.min(box / pxW, box / pxH)
    const tmp = document.createElement('canvas')
    tmp.width = pxW
    tmp.height = pxH
    tmp.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(asset.pixels), pxW, pxH), 0, 0)
    ctx.drawImage(tmp, (box - pxW * s) / 2, (box - pxH * s) / 2, pxW * s, pxH * s)
  }, [asset, pxW, pxH])
  return <canvas ref={ref} />
}

export function LevelsWorkspace({
  levelMode, setLevelMode, level, tiles, tileSize,
  cellPx, setCellPx, showGrid, setShowGrid, onFit, levelCanvasAreaRef,
  levelTool, setLevelTool, assets, assetsById, selectedAssetId, onSelectAsset,
  terrainTool, setTerrainTool, terrainBrushSize, setTerrainBrushSize,
  manualSelectedTile, setManualSelectedTile,
  layerTiles,
  onTerrainStart, onTerrainContinue, onTerrainFill, onTerrainRect, onTerrainPick,
  onPlaceProp, onRemovePropAt, onSurprise,
  levels, onSaveLevel, onLoadLevel, onRemoveLevel,
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [saveName, setSaveName] = useState('')

  const paletteRef = useRef(null)
  const nativeSheetCache = useRef(new Map())
  const indexMapCache = useRef(new Map())

  const baseLayer = level.layers[0] || null
  const baseLayerTile = layerTiles[0] || null

  const activeNative = useMemo(() => {
    if (!baseLayerTile?.tiles?.length) return null
    if (nativeSheetCache.current.has(baseLayerTile)) return nativeSheetCache.current.get(baseLayerTile)
    const sheet = composeNativeSheet(baseLayerTile.tiles, baseLayerTile.tileSize || tileSize)
    nativeSheetCache.current.set(baseLayerTile, sheet)
    return sheet
  }, [baseLayerTile, tileSize])

  const indexMap = useMemo(() => {
    const grid = baseLayer?.grid
    if (!grid) return null
    if (indexMapCache.current.has(grid)) return indexMapCache.current.get(grid)
    const map = computeIndexMap(grid, level.width, level.height, level.seamlessEdges ? 1 : 0)
    indexMapCache.current.set(grid, map)
    return map
  }, [baseLayer, level.width, level.height, level.seamlessEdges])

  const modeToggle = (
    <Segmented
      size="sm"
      value={levelMode}
      onChange={setLevelMode}
      options={[{ value: 'autotile', label: 'Autotile' }, { value: 'manual', label: 'Manual' }]}
    />
  )

  const exportLevelPNG = () => {
    const out = document.createElement('canvas')
    out.width = level.width * tileSize
    out.height = level.height * tileSize
    const ctx = out.getContext('2d')
    ctx.imageSmoothingEnabled = false

    if (baseLayer && baseLayerTile?.tiles) {
      const ltSize = baseLayerTile.tileSize || tileSize
      const sheet = nativeSheetCache.current.get(baseLayerTile) || (() => {
        const s = composeNativeSheet(baseLayerTile.tiles, ltSize)
        nativeSheetCache.current.set(baseLayerTile, s)
        return s
      })()

      for (let y = 0; y < level.height; y++) {
        for (let x = 0; x < level.width; x++) {
          const cell = y * level.width + x
          const manualIdx = baseLayer.manualTiles[cell]
          const idx = manualIdx >= 0 ? manualIdx : (indexMap?.[cell] ?? 0)
          if (!idx) continue
          const sx = (idx % 8) * ltSize
          const sy = Math.floor(idx / 8) * ltSize
          ctx.drawImage(sheet, sx, sy, ltSize, ltSize, x * tileSize, y * tileSize, tileSize, tileSize)
        }
      }
    }

    for (const p of level.placedProps) {
      const a = assetsById[p.assetId]
      if (!a) continue
      const tmp = document.createElement('canvas')
      tmp.width = a.cols * a.tileSize
      tmp.height = a.rows * a.tileSize
      tmp.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(a.pixels), tmp.width, tmp.height), 0, 0)
      ctx.drawImage(tmp, p.x * tileSize, p.y * tileSize, a.cols * tileSize, a.rows * tileSize)
    }

    const link = document.createElement('a')
    link.href = out.toDataURL('image/png')
    link.download = `level_${level.width}x${level.height}.png`
    link.click()
  }

  useEffect(() => {
    if (levelMode !== 'manual') return
    const cv = paletteRef.current
    if (!cv || !activeNative) return
    const pc = 28
    cv.width = 8 * pc
    cv.height = 6 * pc
    const ctx = cv.getContext('2d')
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, cv.width, cv.height)
    ctx.drawImage(activeNative, 0, 0, activeNative.width, activeNative.height, 0, 0, cv.width, cv.height)
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    for (let x = 0; x <= 8; x++) { ctx.beginPath(); ctx.moveTo(x * pc + 0.5, 0); ctx.lineTo(x * pc + 0.5, cv.height); ctx.stroke() }
    for (let y = 0; y <= 6; y++) { ctx.beginPath(); ctx.moveTo(0, y * pc + 0.5); ctx.lineTo(cv.width, y * pc + 0.5); ctx.stroke() }
    const sx = (manualSelectedTile % 8) * pc
    const sy = Math.floor(manualSelectedTile / 8) * pc
    ctx.strokeStyle = '#2fd6a6'
    ctx.lineWidth = 3
    ctx.strokeRect(sx + 1.5, sy + 1.5, pc - 3, pc - 3)
  }, [levelMode, activeNative, manualSelectedTile])

  const pickFromPalette = (e) => {
    const cv = paletteRef.current
    if (!cv) return
    const r = cv.getBoundingClientRect()
    const pc = r.width / 8
    const cx = Math.floor((e.clientX - r.left) / pc)
    const cy = Math.floor((e.clientY - r.top) / pc)
    if (cx >= 0 && cy >= 0 && cx < 8 && cy < 6) setManualSelectedTile(cy * 8 + cx)
  }

  return (
    <div className="editor-grid" style={{ gridTemplateColumns: sidebarOpen ? '286px minmax(0,1fr) 308px' : '0 minmax(0,1fr) 308px' }}>
      <aside className="panel" style={{ display: sidebarOpen ? 'flex' : 'none' }}>
        <div className="panel-head">{modeToggle}</div>
        <div className="panel-scroll">
          <Section title="Tools" icon="brush">
            <Segmented full size="sm" value={levelTool} onChange={setLevelTool}
              options={[{ value: 'terrain', label: 'Terrain' }, { value: 'props', label: 'Props' }]} />
            <p className="hint">
              {levelTool === 'terrain'
                ? (levelMode === 'manual'
                  ? 'Left-click paints, right-click erases. Tile palette below.'
                  : 'Left-click paints solid, right-click erases. Borders autotile.')
                : 'Pick a prop, click to place, right-click to remove.'}
            </p>

            {levelTool === 'terrain' && (
              <>
                <div className="tool-grid">
                  {[
                    { id: 'brush', icon: 'brush', label: 'Brush' },
                    { id: 'fill', icon: 'bucket', label: 'Fill' },
                    { id: 'eraser', icon: 'eraser', label: 'Eraser' },
                    { id: 'picker', icon: 'picker', label: 'Picker' },
                    { id: 'rect', icon: 'rect', label: 'Rect' },
                  ].map(tl => (
                    <button key={tl.id} className={`tool-btn ${terrainTool === tl.id ? 'on' : ''}`}
                      onClick={() => setTerrainTool(tl.id)} title={tl.label}>
                      <PixIcon grid={ICONS[tl.icon]} px={2.5} color={terrainTool === tl.id ? 'var(--accent-ink)' : 'var(--ink-dim)'} />
                      <span>{tl.label}</span>
                    </button>
                  ))}
                </div>
                <label className="field-label">Brush size</label>
                <Segmented full size="sm" value={terrainBrushSize} onChange={setTerrainBrushSize}
                  options={[{ value: 1, label: '1x1' }, { value: 2, label: '3x3' }, { value: 3, label: '5x5' }]} />
              </>
            )}

            {levelTool === 'terrain' && levelMode === 'manual' && (
              <>
                <label className="field-label" style={{ marginTop: 10 }}>Tiles</label>
                <div className="palette-wrap">
                  <canvas ref={paletteRef} className="palette-canvas" onClick={pickFromPalette} />
                </div>
                <p className="hint">Click a tile to select it. Tile #{manualSelectedTile}.</p>
              </>
            )}

            {levelTool === 'props' && (
              <div className="prop-picker" style={{ marginTop: 10 }}>
                {assets.length === 0 ? (
                  <p className="hint">No props yet. Create them in the Assets view.</p>
                ) : (
                  <div className="prop-grid">
                    {assets.map(a => (
                      <button key={a.id} className={`prop-card checker-bg ${selectedAssetId === a.id ? 'selected' : ''}`}
                        onClick={() => onSelectAsset(a.id)} title={`${a.name} · ${a.cols}x${a.rows}`}>
                        <PropMini asset={a} />
                      </button>
                    ))}
                  </div>
                )}
                <Btn size="sm" variant="outline" icon="trash" full style={{ marginTop: 8 }}
                  onClick={level.clearProps} disabled={!level.placedProps.length}>
                  Clear props ({level.placedProps.length})
                </Btn>
              </div>
            )}
          </Section>

          <Section title="Tileset" icon="image">
            <p className="hint">
              {baseLayer?.tileset
                ? `Current tileset: ${baseLayer.tileset.name || 'custom'} · ${baseLayer.tileset.tileSize || tileSize}px`
                : `Using the current editor tileset · ${tileSize}px`}
            </p>
            <p className="hint">Select a biome or saved tileset from the gallery below to change the level material.</p>
          </Section>

          <Section title="Map size" icon="grid">
            <div className="size-selector-row">
              {SIZE_PRESETS.map(p => (
                <button key={p.label}
                  className={`size-cell-btn ${level.width === p.w && level.height === p.h ? 'active' : ''}`}
                  style={{ width: 'auto', padding: '0 10px', height: 28 }}
                  onClick={() => level.resize(p.w, p.h)}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="export-info"><span>Grid</span><b>{level.width} x {level.height}</b></div>
            <div className="row-btns">
              <Btn size="sm" variant="outline" icon="fit" full onClick={onFit}>Fit</Btn>
            </div>
          </Section>

          {levelMode === 'autotile' ? (
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
          ) : (
            <Section title="Manual actions" icon="layers">
              <div className="row-btns">
                <Btn size="sm" variant="outline" icon="grid" full onClick={level.fillAll}>Fill</Btn>
                <Btn size="sm" variant="danger" icon="trash" full onClick={level.clear}>Clear</Btn>
              </div>
            </Section>
          )}

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
            {levels.length === 0 ? (
              <p className="hint">No saved levels yet.</p>
            ) : (
              <div style={{ marginTop: 8 }}>
                {levels.map(row => (
                  <div key={row.id} className="layer-row" onClick={() => onLoadLevel(row)}>
                    <span className="layer-name">{row.name}</span>
                    <span className="tool-meta">{row.width}x{row.height}</span>
                    <button className="lib-card-del" onClick={e => { e.stopPropagation(); onRemoveLevel(row.id) }}>x</button>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      </aside>

      <section className="level-canvas-area" ref={levelCanvasAreaRef}>
        <div className="level-status-bar">
          <span className="level-status-pill">Mode {levelMode}</span>
          <span className="level-status-pill">Map {level.width}x{level.height}</span>
          <span className="level-status-pill">Zoom {cellPx}px</span>
          <span className="level-status-pill">Tileset {baseLayer?.tileset?.name || 'Editor'}</span>
          <span className="level-status-pill">Props {level.placedProps.length}</span>
        </div>
        <button className="sidebar-toggle" onClick={() => setSidebarOpen(o => !o)} title={sidebarOpen ? 'Hide panel' : 'Show panel'}>
          {sidebarOpen ? '<' : '>'}
        </button>
        {tiles ? (
          <LevelCanvas
            layers={level.layers.slice(0, 1)}
            layerTiles={layerTiles.slice(0, 1)}
            width={level.width}
            height={level.height}
            tileSize={tileSize}
            cellPx={cellPx}
            setCellPx={setCellPx}
            seamlessEdges={level.seamlessEdges}
            showGrid={showGrid}
            onStartPaint={onTerrainStart}
            onContinuePaint={onTerrainContinue}
            onEndPaint={level.endStroke}
            terrainTool={terrainTool}
            terrainBrushSize={terrainBrushSize}
            onFillTerrain={onTerrainFill}
            onRectTerrain={onTerrainRect}
            onPickTerrain={onTerrainPick}
            levelTool={levelTool}
            placedProps={level.placedProps}
            assetsById={assetsById}
            selectedAssetId={selectedAssetId}
            onPlaceProp={onPlaceProp}
            onRemovePropAt={onRemovePropAt}
          />
        ) : (
          <div className="level-empty">Generate a tileset first in the Editor view.</div>
        )}
      </section>

      <aside className="panel">
        <div className="panel-scroll">
          <Section title="Minimap" icon="image">
            <div className="mini-wrap">
              <Minimap
                width={level.width}
                height={level.height}
                tileSize={tileSize}
                nativeSheet={baseLayerTile
                  ? (nativeSheetCache.current.get(baseLayerTile) ||
                     composeNativeSheet(baseLayerTile.tiles, baseLayerTile.tileSize || tileSize))
                  : null}
                getIndex={(x, y) => {
                  const cell = y * level.width + x
                  if (!baseLayer) return 0
                  const manual = baseLayer.manualTiles[cell]
                  return manual >= 0 ? manual : (indexMap?.[cell] ?? 0)
                }}
              />
            </div>
            <div className="mini-stats">
              <div className="mini-stat"><b>{level.width * level.height}</b><span>Cells</span></div>
              <div className="mini-stat"><b>{level.placedProps.length}</b><span>Props</span></div>
              <div className="mini-stat"><b>{tileSize}px</b><span>Tile</span></div>
            </div>
          </Section>

          <Section title="Export" icon="download">
            <div className="export-info"><span>Output</span><b>{level.width * tileSize} x {level.height * tileSize}px</b></div>
            <Btn variant="primary" icon="download" full style={{ marginTop: 10 }} onClick={exportLevelPNG}>Export level PNG</Btn>
          </Section>
        </div>
      </aside>
    </div>
  )
}

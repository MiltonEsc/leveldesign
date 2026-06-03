import { useState, useEffect, useRef } from 'react'
import { Segmented } from '../ui/Segmented.jsx'
import { Section }   from '../ui/Section.jsx'
import { Btn }       from '../ui/Btn.jsx'
import { ColorRow }  from '../ui/ColorRow.jsx'
import { PixelCanvas }       from './PixelCanvas.jsx'
import { TilePreviewMosaic } from './TilePreviewMosaic.jsx'
import { AITilePanel }       from '../Generator/AITilePanel.jsx'
import { AIProceduralPanel } from '../Generator/AIProceduralPanel.jsx'
import { composeNativeSheet } from '../../core/composeSheet.js'
import { exportTilesheet }   from '../../core/exportSheet.js'

const PAL_KEYS = [
  ['primary', 'Primary'], ['secondary', 'Secondary'], ['border', 'Border'],
  ['highlight', 'Highlight'], ['shadow', 'Shadow'],
]
const QUICK_SWATCHES = ['#ef6f6f','#e84d4d','#e8902f','#f2c94c','#5fc96a','#3fd6a0','#3fc7d6','#4d8de8','#a06be0','#9aa0a8','#3a3f47','#f4f6f8']

// Renders a composed tileset (ImageData[48]) into a canvas at a given scale.
function SheetCanvas({ tiles, tileSize, scale, className }) {
  const ref = useRef(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const native = composeNativeSheet(tiles, tileSize)
    cv.width = native.width * scale
    cv.height = native.height * scale
    const ctx = cv.getContext('2d')
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(native, 0, 0, native.width, native.height, 0, 0, cv.width, cv.height)
  }, [tiles, tileSize, scale])
  return <canvas ref={ref} className={className} />
}

export function EditorWorkspace({
  mode, setMode, tileSize, biome, onColorChange, onResetColors, onShuffleColors,
  drawing, tiles, onGenerate, onAITile, onAIProcedural, biomeId, savedCount,
  editorKind, setEditorKind,
}) {
  const [zoom, setZoom] = useState(4)
  const [exportScale, setExportScale] = useState(1)
  const cols = 8, rows = 6

  const handleExport = () => {
    if (!tiles) return
    exportTilesheet(tiles, tileSize, `tileset_${biomeId || 'custom'}_${tileSize}px.png`, exportScale)
  }

  return (
    <div className="editor-grid">
      {/* LEFT */}
      <aside className="panel">
        <div className="panel-head">
          <Segmented full value={editorKind} onChange={setEditorKind}
            options={[{ value: 'tileset', label: 'Tileset' }, { value: 'prop', label: 'Assets' }]} />
        </div>
        <div className="panel-scroll">
          <Section title="Mode" icon="layers">
            <Segmented full size="sm" value={mode} onChange={setMode}
              options={[{ value: 'procedural', label: 'Procedural' }, { value: 'draw', label: 'Manual' }]} />
            <p className="hint">Procedural builds all 48 tiles from the biome palette. Manual draws a base tile.</p>
          </Section>

          <Section title={`Biome palette · ${biome.label}`} icon="brush"
            right={<span className="chip-mini" onClick={(e) => { e.stopPropagation(); onShuffleColors() }} title="Shuffle">⤭</span>}>
            {PAL_KEYS.map(([k, label]) => (
              <ColorRow key={k} label={label} value={biome.colors[k]} onChange={(v) => onColorChange(k, v)} />
            ))}
            <div className="row-btns">
              <Btn size="sm" variant="accentSoft" icon="dice" full onClick={onShuffleColors}>Shuffle</Btn>
              <Btn size="sm" variant="outline" icon="reset" full onClick={onResetColors}>Reset</Btn>
            </div>
          </Section>

          {mode === 'draw' && (
            <Section title="Color palette" icon="brush">
              <p className="hint">Quick colors for Manual painting.</p>
              <div className="swatch-grid">
                {QUICK_SWATCHES.map((c) => (
                  <button key={c} className={`swatch ${drawing.activeColor === c ? 'active' : ''}`}
                    style={{ background: c }} title={c} onClick={() => drawing.setActiveColor(c)} />
                ))}
              </div>
            </Section>
          )}

          <Section title="AI textures" icon="spark" defaultOpen={false}>
            {mode === 'draw'
              ? <AITilePanel tileSize={tileSize} onGenerated={onAITile} />
              : <AIProceduralPanel tileSize={tileSize} onGenerated={onAIProcedural} />}
          </Section>
        </div>
      </aside>

      {/* CENTER */}
      <main className="stage">
        <div className="stage-toolbar">
          <Segmented size="sm" value={mode} onChange={setMode}
            options={[{ value: 'procedural', label: 'Procedural' }, { value: 'draw', label: 'Manual' }]} />
          <div className="biome-pill"><span className="dot" style={{ background: biome.colors.primary }} /> {biome.label}</div>
          <div className="spacer" />
          <span className="tool-meta">{cols} × {rows} · {tileSize}px</span>
          {mode === 'draw' && (
            <div className="zoom-ctrl">
              <button onClick={() => drawing.setZoom((z) => Math.max(2, z - 1))}>−</button>
              <span>{drawing.zoom}×</span>
              <button onClick={() => drawing.setZoom((z) => Math.min(32, z + 1))}>+</button>
            </div>
          )}
        </div>

        <div className="stage-canvas">
          {mode === 'draw' ? (
            <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'center' }}>
              <div className="canvas-frame">
                <PixelCanvas
                  pixels={drawing.pixels} tileSize={tileSize} zoom={drawing.zoom}
                  onStartStroke={drawing.startStroke} onContinueStroke={drawing.continueStroke} onEndStroke={drawing.endStroke}
                />
              </div>
              <TilePreviewMosaic pixels={drawing.committedPixels} tileSize={tileSize} />
            </div>
          ) : (
            <div className="canvas-frame">
              <SheetCanvas tiles={tiles} tileSize={tileSize} scale={zoom} className="main-canvas" />
            </div>
          )}
        </div>

        <div className="stage-actions">
          <Btn variant="outline" icon="reset" onClick={onResetColors}>Reset</Btn>
          <Btn variant="accentSoft" icon="dice" onClick={onShuffleColors}>Shuffle palette</Btn>
          <Btn variant="primary" size="lg" icon="grid" onClick={onGenerate}>
            {mode === 'draw' ? 'Generate from drawing' : 'Generate procedural'}
          </Btn>
        </div>
      </main>

      {/* RIGHT */}
      <aside className="panel">
        <div className="panel-scroll">
          <Section title={`Preview · ${cols} × ${rows}`} icon="image">
            <div className="preview-wrap">
              <SheetCanvas tiles={tiles} tileSize={tileSize} scale={3} className="preview-canvas" />
            </div>
            <div className="mini-stats">
              <div className="mini-stat"><b>{tileSize}px</b><span>Tile size</span></div>
              <div className="mini-stat"><b>{cols * rows}</b><span>Tiles</span></div>
              <div className="mini-stat"><b>{savedCount}</b><span>Saved</span></div>
            </div>
          </Section>

          <Section title="Export" icon="download">
            <label className="field-label">Scale</label>
            <Segmented full size="sm" value={exportScale} onChange={setExportScale}
              options={[{ value: 1, label: '1×' }, { value: 2, label: '2×' }, { value: 4, label: '4×' }]} />
            <div className="export-info">
              <span>Output</span>
              <b>{cols * tileSize * exportScale} × {rows * tileSize * exportScale}px</b>
            </div>
            <Btn variant="primary" icon="download" full style={{ marginTop: 10 }} onClick={handleExport}>Export PNG</Btn>
          </Section>
        </div>
      </aside>
    </div>
  )
}

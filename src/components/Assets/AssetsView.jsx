import { useState, useEffect, useCallback } from 'react'
import { ToolBar }       from '../Editor/ToolBar.jsx'
import { PaletteRow }    from '../Editor/PaletteRow.jsx'
import { AssetCanvas }   from './AssetCanvas.jsx'
import { AssetAIPanel }  from './AssetAIPanel.jsx'
import { SizeSelector }  from './SizeSelector.jsx'
import { AssetGallery }  from './AssetGallery.jsx'
import { useAssetEditor } from '../../hooks/useAssetEditor.js'
import { exportAsset, exportAllAssets } from '../../core/exportAsset.js'

// Fits the prop into roughly a 340px square edit area.
function fitZoom(pxW, pxH) {
  return Math.max(4, Math.min(28, Math.floor(340 / Math.max(pxW, pxH))))
}

export function AssetsView({ tileSize, gallery }) {
  const [cols, setCols] = useState(2)
  const [rows, setRows] = useState(2)
  const [workTileSize, setWorkTileSize] = useState(tileSize)
  const [name, setName] = useState('prop')

  const pxW = cols * workTileSize
  const pxH = rows * workTileSize
  const editor = useAssetEditor(pxW, pxH)

  // Switching the global tile size resets the working canvas (deliberate).
  useEffect(() => {
    setWorkTileSize(tileSize)
    editor.resetCanvas(cols * tileSize, rows * tileSize)
  }, [tileSize]) // eslint-disable-line

  const handleSizeChange = useCallback((c, r) => {
    setCols(c); setRows(r)
    editor.resetCanvas(c * workTileSize, r * workTileSize)
  }, [editor, workTileSize])

  const handleGenerated = useCallback((pixels) => {
    editor.loadPixels(pixels, pxW, pxH)
  }, [editor, pxW, pxH])

  const handleSave = useCallback(() => {
    gallery.add({ name, cols, rows, tileSize: workTileSize, pixels: editor.getPixels() })
  }, [gallery, name, cols, rows, workTileSize, editor])

  const handleLoadToEditor = useCallback((asset) => {
    setCols(asset.cols); setRows(asset.rows)
    setWorkTileSize(asset.tileSize); setName(asset.name)
    editor.loadPixels(asset.pixels, asset.cols * asset.tileSize, asset.rows * asset.tileSize)
  }, [editor])

  const zoom = fitZoom(pxW, pxH)

  return (
    <main className="app-main assets-main">
      <aside className="sidebar">
        <ToolBar
          tool={editor.tool} setTool={editor.setTool}
          brush={editor.brush} setBrush={editor.setBrush}
          onUndo={editor.undo} onRedo={editor.redo}
          canUndo={editor.canUndo} canRedo={editor.canRedo}
        />
        <PaletteRow activeColor={editor.activeColor} setActiveColor={editor.setActiveColor} />
        <SizeSelector cols={cols} rows={rows} tileSize={workTileSize} onChange={handleSizeChange} />
        <AssetAIPanel pxW={pxW} pxH={pxH} onGenerated={handleGenerated} />
      </aside>

      <section className="canvas-area assets-canvas-area">
        <div className="asset-edit-block">
          <div className="canvas-label">Prop ({pxW}×{pxH}px · {cols}×{rows})</div>
          <AssetCanvas
            pixels={editor.pixels}
            width={pxW} height={pxH}
            zoom={zoom}
            onStartStroke={editor.startStroke}
            onContinueStroke={editor.continueStroke}
            onEndStroke={editor.endStroke}
          />
          <div className="asset-edit-actions">
            <input
              className="asset-name-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Prop name"
            />
            <button className="asset-clear-btn" onClick={editor.clear} title="Clear canvas">🧹 Clear</button>
            <button className="asset-save-btn" onClick={handleSave} title="Save to gallery">💾 Save to gallery</button>
          </div>
        </div>
      </section>

      <aside className="preview-panel assets-gallery-panel">
        <AssetGallery
          assets={gallery.assets}
          selectedId={gallery.selectedId}
          onSelect={gallery.select}
          onRemove={gallery.remove}
          onExport={(a) => exportAsset(a)}
          onExportAll={() => exportAllAssets(gallery.assets)}
          onLoadToEditor={handleLoadToEditor}
        />
      </aside>
    </main>
  )
}

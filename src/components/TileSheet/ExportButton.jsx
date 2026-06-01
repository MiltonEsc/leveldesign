import { exportTilesheet } from '../../core/exportSheet.js'

export function ExportButton({ tiles, tileSize, biomeName }) {
  const handleExport = () => {
    if (!tiles) return
    const filename = `tileset_${biomeName || 'custom'}_${tileSize}px.png`
    exportTilesheet(tiles, tileSize, filename)
  }

  return (
    <button
      className="export-btn"
      onClick={handleExport}
      disabled={!tiles}
      title="Download tileset as PNG (8×6 grid)"
    >
      ⬇️ Export PNG
    </button>
  )
}

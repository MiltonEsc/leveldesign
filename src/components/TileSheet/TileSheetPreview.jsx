import { TileCell } from './TileCell.jsx'

export function TileSheetPreview({ tiles, tileSize }) {
  return (
    <div className="tilesheet-preview">
      <div className="tilesheet-label">Tileset Preview — 8 × 6</div>
      <div className="tilesheet-grid" style={{ gridTemplateColumns: 'repeat(8, auto)' }}>
        {Array.from({ length: 48 }, (_, i) => (
          <TileCell
            key={i}
            index={i}
            tile={tiles ? tiles[i] : null}
            tileSize={tileSize}
          />
        ))}
      </div>
    </div>
  )
}

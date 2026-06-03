const SHEET_COLS = 8
const SHEET_ROWS = 6

export function exportTilesheet(tiles, tileSize, filename = 'tileset.png', scale = 1) {
  const sheetW = SHEET_COLS * tileSize * scale
  const sheetH = SHEET_ROWS * tileSize * scale

  const canvas = document.createElement('canvas')
  canvas.width  = sheetW
  canvas.height = sheetH
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = false // keep crisp pixels when scaling up

  for (let i = 0; i < 48; i++) {
    if (!tiles[i]) continue
    const col = i % SHEET_COLS
    const row = Math.floor(i / SHEET_COLS)
    const x = col * tileSize * scale
    const y = row * tileSize * scale

    // Draw ImageData into a temp canvas then blit (scaled) to main sheet
    const tmp = document.createElement('canvas')
    tmp.width  = tileSize
    tmp.height = tileSize
    tmp.getContext('2d').putImageData(tiles[i], 0, 0)
    ctx.drawImage(tmp, 0, 0, tileSize, tileSize, x, y, tileSize * scale, tileSize * scale)
  }

  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }, 'image/png')
}

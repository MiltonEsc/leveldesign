const SHEET_COLS = 8
const SHEET_ROWS = 6

// `frames` (optional) = extra animation frames (each an ImageData[48]); they
// stack below the base sheet as full 8×6 blocks, top to bottom.
export function exportTilesheet(tiles, tileSize, filename = 'tileset.png', scale = 1, frames = null) {
  const blocks = [tiles, ...(frames || [])]
  const sheetW = SHEET_COLS * tileSize * scale
  const sheetH = SHEET_ROWS * tileSize * scale * blocks.length

  const canvas = document.createElement('canvas')
  canvas.width  = sheetW
  canvas.height = sheetH
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = false // keep crisp pixels when scaling up

  const tmp = document.createElement('canvas')
  tmp.width  = tileSize
  tmp.height = tileSize
  const tmpCtx = tmp.getContext('2d')

  blocks.forEach((blockTiles, block) => {
    const blockY = block * SHEET_ROWS * tileSize * scale
    for (let i = 0; i < 48; i++) {
      if (!blockTiles?.[i]) continue
      const x = (i % SHEET_COLS) * tileSize * scale
      const y = blockY + Math.floor(i / SHEET_COLS) * tileSize * scale

      // Draw ImageData into a temp canvas then blit (scaled) to main sheet
      tmpCtx.putImageData(blockTiles[i], 0, 0)
      ctx.drawImage(tmp, 0, 0, tileSize, tileSize, x, y, tileSize * scale, tileSize * scale)
    }
  })

  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    // Revoking synchronously can abort the download in some browsers; give the
    // fetch a moment (same pattern as exportLevel.js).
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, 'image/png')
}

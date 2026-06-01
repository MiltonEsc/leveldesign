import { BITS, validMasks, BITMASK_TO_INDEX } from '../constants/bitmaskTable.js'
import { darkenRegion, tintRegion, hexToRGBA, getPixelIdx } from './canvasUtils.js'

const EDGE_WIDTH = 2

// Creates a checkerboard ImageData for the empty tile slot
function makeEmptyTile(tileSize) {
  const data = new Uint8ClampedArray(tileSize * tileSize * 4)
  const light = [80, 80, 80, 255]
  const dark  = [50, 50, 50, 255]
  for (let y = 0; y < tileSize; y++) {
    for (let x = 0; x < tileSize; x++) {
      const i = (y * tileSize + x) * 4
      const color = ((x + y) % 2 === 0) ? light : dark
      data[i]     = color[0]
      data[i + 1] = color[1]
      data[i + 2] = color[2]
      data[i + 3] = color[3]
    }
  }
  return new ImageData(data, tileSize, tileSize)
}

// Brightens a single pixel (inner corner highlight)
function brightenPixel(data, x, y, width, factor = 1.4) {
  const i = getPixelIdx(x, y, width)
  if (data[i + 3] === 0) return
  data[i]     = Math.min(255, Math.round(data[i]     * factor))
  data[i + 1] = Math.min(255, Math.round(data[i + 1] * factor))
  data[i + 2] = Math.min(255, Math.round(data[i + 2] * factor))
}

// Given a base ImageData (user-drawn tile), generate all 48 tile variants.
// The base tile is treated as the "center" tile (all neighbors same).
// For each bitmask, edge/corner regions are modified to indicate borders.
export function generateAllTiles(baseBitmap, tileSize) {
  const tiles = new Array(48)

  // Tile 0: empty (checkerboard)
  tiles[0] = makeEmptyTile(tileSize)

  for (const mask of validMasks) {
    const sheetIndex = BITMASK_TO_INDEX.get(mask)

    const t  = (mask & BITS.T)  !== 0
    const b  = (mask & BITS.B)  !== 0
    const l  = (mask & BITS.L)  !== 0
    const r  = (mask & BITS.R)  !== 0
    const tl = (mask & BITS.TL) !== 0
    const tr = (mask & BITS.TR) !== 0
    const bl = (mask & BITS.BL) !== 0
    const br = (mask & BITS.BR) !== 0

    // Clone base pixel data
    const data = new Uint8ClampedArray(baseBitmap.data)
    const s = tileSize

    // Cardinal edge darkening (exposed edges)
    const ew = EDGE_WIDTH
    if (!t) darkenRegion(data, s, 0,     0,     s,  ew, 0.45)
    if (!b) darkenRegion(data, s, 0,     s - ew, s, ew, 0.45)
    if (!l) darkenRegion(data, s, 0,     0,     ew, s,  0.45)
    if (!r) darkenRegion(data, s, s - ew, 0,    ew, s,  0.45)

    // Outer corner darkening (junction of two exposed edges)
    if (!t && !l) darkenRegion(data, s, 0,      0,      ew, ew, 0.6)
    if (!t && !r) darkenRegion(data, s, s - ew, 0,      ew, ew, 0.6)
    if (!b && !l) darkenRegion(data, s, 0,      s - ew, ew, ew, 0.6)
    if (!b && !r) darkenRegion(data, s, s - ew, s - ew, ew, ew, 0.6)

    // Inner corner highlights (diagonal missing, both cardinals present)
    if (t && l && !tl) brightenPixel(data, 0,     0,     s, 1.5)
    if (t && r && !tr) brightenPixel(data, s - 1, 0,     s, 1.5)
    if (b && l && !bl) brightenPixel(data, 0,     s - 1, s, 1.5)
    if (b && r && !br) brightenPixel(data, s - 1, s - 1, s, 1.5)

    // Inner corner shadow tint (small dark patch at inner corner)
    if (t && l && !tl) darkenRegion(data, s, 0,     0,     1, 1, 0.5)
    if (t && r && !tr) darkenRegion(data, s, s - 1, 0,     1, 1, 0.5)
    if (b && l && !bl) darkenRegion(data, s, 0,     s - 1, 1, 1, 0.5)
    if (b && r && !br) darkenRegion(data, s, s - 1, s - 1, 1, 1, 0.5)

    tiles[sheetIndex] = new ImageData(data, tileSize, tileSize)
  }

  return tiles
}

// Fallback: generates a solid-color tile with border (no user drawing needed)
export function generateSolidTile(tileSize, primaryHex, borderHex) {
  const [pr, pg, pb] = hexToRGBA(primaryHex)
  const [br, bg, bb] = hexToRGBA(borderHex)
  const data = new Uint8ClampedArray(tileSize * tileSize * 4)

  for (let y = 0; y < tileSize; y++) {
    for (let x = 0; x < tileSize; x++) {
      const i = (y * tileSize + x) * 4
      data[i]     = pr
      data[i + 1] = pg
      data[i + 2] = pb
      data[i + 3] = 255
    }
  }

  return new ImageData(data, tileSize, tileSize)
}

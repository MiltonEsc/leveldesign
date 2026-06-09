// Tile anti-repetition: the "fill" tile (fully-interior, all neighbours present)
// repeats across big solid areas and shows the grid. We derive a few VARIANTS of
// just that tile and pick one per cell with a deterministic hash, breaking the
// repetition. Variants only shuffle INTERIOR pixels (border row/col untouched) so
// seamless tiling is preserved and no new colours are introduced.
import { BITMASK_TO_INDEX } from '../constants/bitmaskTable.js'

// Sheet index of the fill tile (bitmask 0xFF = every neighbour solid).
export const FILL_INDEX = BITMASK_TO_INDEX.get(0xFF)

export const VARIANT_COUNT = 3

// Deterministic per-cell pick in [0, total). total = 1 (base) + variant count.
export function pickVariant(x, y, total) {
  if (total <= 1) return 0
  let h = (x * 374761393 + y * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h = (h ^ (h >>> 16)) >>> 0
  return h % total
}

// One variant: mirror the INTERIOR region (border row/col untouched, so seamless
// tiling and the palette are preserved) — a clearly visible "the texture moved"
// change. fx/fy select horizontal/vertical mirroring (both = 180° rotation).
function transformInterior(src, size, fx, fy) {
  const out = new Uint8ClampedArray(src.data) // border kept as-is
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const sx = fx ? (size - 1 - x) : x
      const sy = fy ? (size - 1 - y) : y
      const di = (y * size + x) * 4
      const si = (sy * size + sx) * 4
      out[di] = src.data[si]
      out[di + 1] = src.data[si + 1]
      out[di + 2] = src.data[si + 2]
      out[di + 3] = src.data[si + 3]
    }
  }
  return new ImageData(out, size, size)
}

// Up to 3 variants of the fill tile via interior mirroring (flipX / flipY / rot180).
const VARIANT_MODES = [[true, false], [false, true], [true, true]]

// Builds `count` variant ImageData from the fill tile. Returns [] if no fill tile
// (or it's too small to vary safely).
export function makeFillVariants(fillTile, size, count = VARIANT_COUNT) {
  if (!fillTile?.data || size < 4) return []
  const variants = []
  for (let v = 0; v < count; v++) {
    const [fx, fy] = VARIANT_MODES[v % VARIANT_MODES.length]
    variants.push(transformInterior(fillTile, size, fx, fy))
  }
  return variants
}

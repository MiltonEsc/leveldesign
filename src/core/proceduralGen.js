import { BITS, validMasks, BITMASK_TO_INDEX } from '../constants/bitmaskTable.js'
import {
  hexToRGBA, fillRegion, applyOrderedDither,
  setPixelRGBA, getPixelIdx
} from './canvasUtils.js'

// Draws a single tile procedurally for a given bitmask and biome
function drawTile(mask, tileSize, colors, params) {
  const data = new Uint8ClampedArray(tileSize * tileSize * 4)
  const s = tileSize

  const t  = (mask & BITS.T)  !== 0
  const b  = (mask & BITS.B)  !== 0
  const l  = (mask & BITS.L)  !== 0
  const r  = (mask & BITS.R)  !== 0
  const tl = (mask & BITS.TL) !== 0
  const tr = (mask & BITS.TR) !== 0
  const bl = (mask & BITS.BL) !== 0
  const br = (mask & BITS.BR) !== 0

  const [pr, pg, pb] = hexToRGBA(colors.primary)
  const [sr, sg, sb] = hexToRGBA(colors.secondary)
  const [boR, boG, boB] = hexToRGBA(colors.border)
  const [hr, hg, hb] = hexToRGBA(colors.highlight)
  const [shr, shg, shb] = hexToRGBA(colors.shadow)

  // Step 1: Fill with primary color
  fillRegion(data, s, 0, 0, s, s, pr, pg, pb, 255)

  // Step 2: Pattern/dither texture
  if (params.dither) {
    applyOrderedDither(data, s, s, [sr, sg, sb, 255], params.ditherStrength)
  } else if (params.patternFn === 'brickPattern') {
    drawBrickPattern(data, s, pr, pg, pb, sr, sg, sb)
  } else if (params.patternFn === 'stonePattern') {
    drawStonePattern(data, s, pr, pg, pb, sr, sg, sb)
  } else if (params.patternFn === 'wavyPattern') {
    drawWavyPattern(data, s, pr, pg, pb, sr, sg, sb)
  } else if (params.patternFn === 'crackedPattern') {
    drawCrackedPattern(data, s, pr, pg, pb, sr, sg, sb)
  }

  const ew = params.edgeWidth

  // Step 3: Draw border strips (exposed cardinal edges)
  if (!t) fillRegion(data, s, 0,      0,      s,  ew, boR, boG, boB, 255)
  if (!b) fillRegion(data, s, 0,      s - ew, s,  ew, boR, boG, boB, 255)
  if (!l) fillRegion(data, s, 0,      0,      ew, s,  boR, boG, boB, 255)
  if (!r) fillRegion(data, s, s - ew, 0,      ew, s,  boR, boG, boB, 255)

  // Step 4: Inner corner indicators (diagonal missing, both cardinals present)
  // Draw a 1×1 highlight pixel at the inner concave corner
  if (t && l && !tl) {
    setPixelRGBA(data, 0,     0,     s, hr, hg, hb, 255)
    setPixelRGBA(data, 1,     0,     s, shr, shg, shb, 255)
    setPixelRGBA(data, 0,     1,     s, shr, shg, shb, 255)
  }
  if (t && r && !tr) {
    setPixelRGBA(data, s - 1, 0,     s, hr, hg, hb, 255)
    setPixelRGBA(data, s - 2, 0,     s, shr, shg, shb, 255)
    setPixelRGBA(data, s - 1, 1,     s, shr, shg, shb, 255)
  }
  if (b && l && !bl) {
    setPixelRGBA(data, 0,     s - 1, s, hr, hg, hb, 255)
    setPixelRGBA(data, 1,     s - 1, s, shr, shg, shb, 255)
    setPixelRGBA(data, 0,     s - 2, s, shr, shg, shb, 255)
  }
  if (b && r && !br) {
    setPixelRGBA(data, s - 1, s - 1, s, hr, hg, hb, 255)
    setPixelRGBA(data, s - 2, s - 1, s, shr, shg, shb, 255)
    setPixelRGBA(data, s - 1, s - 2, s, shr, shg, shb, 255)
  }

  // Step 5: Corner style adjustments
  if (params.cornerStyle === 'rounded') {
    applyRoundedCorners(data, s, !t, !b, !l, !r, boR, boG, boB)
  }

  return new ImageData(data, tileSize, tileSize)
}

function drawBrickPattern(data, s, pr, pg, pb, sr, sg, sb) {
  const brickH = Math.max(2, Math.floor(s / 4))
  const brickW = Math.max(2, Math.floor(s / 2))
  for (let y = 0; y < s; y++) {
    const row = Math.floor(y / brickH)
    const offset = (row % 2 === 0) ? 0 : Math.floor(brickW / 2)
    for (let x = 0; x < s; x++) {
      const inMortar = (y % brickH === 0) || ((x + offset) % brickW === 0)
      if (inMortar) {
        setPixelRGBA(data, x, y, s, sr, sg, sb, 255)
      }
    }
  }
}

function drawStonePattern(data, s, pr, pg, pb, sr, sg, sb) {
  // Simple pseudo-random stone crack lines
  const seed = 42
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const n = ((x * 7 + y * 13 + seed) * 2654435761) & 0xFFFFFFFF
      if ((n % 16) < 1) {
        setPixelRGBA(data, x, y, s, sr, sg, sb, 255)
      }
    }
  }
}

function drawWavyPattern(data, s, pr, pg, pb, sr, sg, sb) {
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const wave = Math.sin((x + y * 0.5) * (Math.PI / (s / 2)))
      if (wave > 0.5) {
        setPixelRGBA(data, x, y, s, sr, sg, sb, 255)
      }
    }
  }
}

function drawCrackedPattern(data, s, pr, pg, pb, sr, sg, sb) {
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const n = ((x * 5 + y * 11) * 2246822519) & 0xFFFFFFFF
      if ((n % 8) < 1) {
        setPixelRGBA(data, x, y, s, sr, sg, sb, 255)
      }
    }
  }
}

function applyRoundedCorners(data, s, noTop, noBot, noLeft, noRight, br, bg, bb) {
  // Soften outer corners by adding a diagonal pixel at the corner junction
  if (!noTop && !noLeft) {
    setPixelRGBA(data, 0, 0, s, br, bg, bb, 255)
  }
  if (!noTop && !noRight) {
    setPixelRGBA(data, s - 1, 0, s, br, bg, bb, 255)
  }
  if (!noBot && !noLeft) {
    setPixelRGBA(data, 0, s - 1, s, br, bg, bb, 255)
  }
  if (!noBot && !noRight) {
    setPixelRGBA(data, s - 1, s - 1, s, br, bg, bb, 255)
  }
}

// Generates all 48 tiles procedurally for a given biome
export function generateAllBiomeTiles(biome, tileSize) {
  const tiles = new Array(48)

  // Tile 0: transparent empty slot
  const emptyData = new Uint8ClampedArray(tileSize * tileSize * 4)
  const [pr, pg, pb] = hexToRGBA(biome.colors.primary)
  const [br2, bg2, bb2] = hexToRGBA(biome.colors.border)
  // Checkerboard for empty slot using biome dark tones
  for (let y = 0; y < tileSize; y++) {
    for (let x = 0; x < tileSize; x++) {
      const i = (y * tileSize + x) * 4
      const light = ((x + y) % 2 === 0)
      emptyData[i]     = light ? 70 : 45
      emptyData[i + 1] = light ? 70 : 45
      emptyData[i + 2] = light ? 70 : 45
      emptyData[i + 3] = 255
    }
  }
  tiles[0] = new ImageData(emptyData, tileSize, tileSize)

  for (const mask of validMasks) {
    const sheetIndex = BITMASK_TO_INDEX.get(mask)
    tiles[sheetIndex] = drawTile(mask, tileSize, biome.colors, biome.proceduralParams)
  }

  return tiles
}

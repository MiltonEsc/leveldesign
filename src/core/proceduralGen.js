import { BITS, validMasks, BITMASK_TO_INDEX } from '../constants/bitmaskTable.js'
import {
  hexToRGBA, fillRegion, applyOrderedDither,
  setPixelRGBA, getPixelIdx
} from './canvasUtils.js'

const EDGE_SEED = 1337

// Deterministic per-pixel hash → 0..1
function rnd(x, y, seed) {
  let n = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}

// Picks a textured border color so the edge isn't a flat fill: mostly `border`,
// with scattered `shadow` (darker) and `highlight` (brighter) pixels.
function edgeColor(x, y, seed, bo, sh, hi) {
  const r = rnd(x, y, seed)
  if (r < 0.24) return sh
  if (r > 0.80) return hi
  return bo
}

// Paints one border strip with an irregular (noisy) inner boundary and a
// textured color, giving a snow/ice-like edge instead of a solid bar.
// side: 0=top 1=bottom 2=left 3=right. bo/sh/hi are [r,g,b].
function paintEdge(data, s, side, ew, bo, sh, hi, seed) {
  for (let p = 0; p < s; p++) {
    const depth = ew + (rnd(p, side * 31 + 5, seed) < 0.34 ? 1 : 0)
    for (let d = 0; d < depth; d++) {
      let x, y
      if (side === 0)      { x = p;          y = d }
      else if (side === 1) { x = p;          y = s - 1 - d }
      else if (side === 2) { x = d;          y = p }
      else                 { x = s - 1 - d;  y = p }
      const c = edgeColor(x, y, seed, bo, sh, hi)
      setPixelRGBA(data, x, y, s, c[0], c[1], c[2], 255)
    }
  }
}

// Draws a single tile procedurally for a given bitmask and biome.
// `frameSeed` > 0 produces an animation frame: the textured edges re-scatter
// with a shifted seed and a light interior shimmer is added, so cycling the
// frames reads as living material (water glints, snow sparkle).
function drawTile(mask, tileSize, colors, params, frameSeed = 0) {
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

  // Step 2.5: animation shimmer — scatter a few secondary/highlight pixels
  // with a per-frame seed (frame 0 stays exactly the static tile).
  if (frameSeed) {
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const v = rnd(x, y, frameSeed * 7919)
        if (v < 0.045) setPixelRGBA(data, x, y, s, sr, sg, sb, 255)
        else if (v > 0.985) setPixelRGBA(data, x, y, s, hr, hg, hb, 255)
      }
    }
  }

  // Border scales with tile size so it stays visible on large tiles (e.g. 64px)
  const ew = Math.max(params.edgeWidth, Math.round(tileSize / 6))
  const bo = [boR, boG, boB], sh = [shr, shg, shb], hi = [hr, hg, hb]
  const edgeSeed = EDGE_SEED + frameSeed * 101

  // Step 3: Draw border strips (exposed cardinal edges) — textured, not flat
  if (!t) paintEdge(data, s, 0, ew, bo, sh, hi, edgeSeed)
  if (!b) paintEdge(data, s, 1, ew, bo, sh, hi, edgeSeed)
  if (!l) paintEdge(data, s, 2, ew, bo, sh, hi, edgeSeed)
  if (!r) paintEdge(data, s, 3, ew, bo, sh, hi, edgeSeed)

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

function copyPixel(data, src, x, y, s) {
  const i = getPixelIdx(x, y, s)
  data[i] = src[i]; data[i + 1] = src[i + 1]; data[i + 2] = src[i + 2]; data[i + 3] = 255
}

// Copies a border strip from an `edge` texture with an irregular inner boundary.
function paintEdgeFromTexture(data, edge, s, side, ew, seed) {
  for (let p = 0; p < s; p++) {
    const depth = ew + (rnd(p, side * 31 + 5, seed) < 0.34 ? 1 : 0)
    for (let d = 0; d < depth; d++) {
      let x, y
      if (side === 0)      { x = p;         y = d }
      else if (side === 1) { x = p;         y = s - 1 - d }
      else if (side === 2) { x = d;         y = p }
      else                 { x = s - 1 - d; y = p }
      copyPixel(data, edge, x, y, s)
    }
  }
}

function makeEmptyTileData(s) {
  const d = new Uint8ClampedArray(s * s * 4)
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const i = (y * s + x) * 4
      const light = ((x + y) % 2 === 0)
      d[i] = light ? 70 : 45; d[i + 1] = light ? 70 : 45; d[i + 2] = light ? 70 : 45; d[i + 3] = 255
    }
  }
  return new ImageData(d, s, s)
}

// Composes all 48 tiles from a CENTER texture + an EDGE source. `edgeData` is an
// ImageData (e.g. an AI snow texture) or null → a speckled edge is synthesized
// from DARKENED AVERAGES of the center texture, so the border matches the
// material's hue (the old palette-speckle edge gave e.g. a lava center pale
// grass-green borders when the active biome was grass). The average — rather
// than a per-pixel darkened copy of the center — keeps the border UNIFORM on
// every side: AI images often carry bands/artifacts in their boundary rows,
// and copying those made the top border differ from the bottom one. Always
// autotiles correctly because tiles are composed (not cropped from an AI
// sheet). `biomeColors` is kept for signature compatibility only.
export function generateTilesFromTextures(centerData, edgeData, tileSize, biomeColors) { // eslint-disable-line no-unused-vars
  const s = tileSize
  const center = centerData.data
  const ew = Math.max(2, Math.round(s / 6))

  let edge
  if (edgeData) {
    edge = edgeData.data
  } else {
    let ar = 0, ag = 0, ab = 0
    const count = s * s
    for (let i = 0; i < center.length; i += 4) { ar += center[i]; ag += center[i + 1]; ab += center[i + 2] }
    ar /= count; ag /= count; ab /= count
    // Same darken levels as draw mode's exposed edges: base, shadow, highlight.
    const tone = (f) => [Math.round(ar * f), Math.round(ag * f), Math.round(ab * f)]
    const bo = tone(0.45), sh = tone(0.30), hi = tone(0.62)
    edge = new Uint8ClampedArray(s * s * 4)
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const c = edgeColor(x, y, EDGE_SEED, bo, sh, hi)
        setPixelRGBA(edge, x, y, s, c[0], c[1], c[2], 255)
      }
    }
  }

  const tiles = new Array(48)
  tiles[0] = makeEmptyTileData(s)

  for (const mask of validMasks) {
    const idx = BITMASK_TO_INDEX.get(mask)
    const t  = (mask & BITS.T)  !== 0, b  = (mask & BITS.B)  !== 0
    const l  = (mask & BITS.L)  !== 0, r  = (mask & BITS.R)  !== 0
    const tl = (mask & BITS.TL) !== 0, tr = (mask & BITS.TR) !== 0
    const bl = (mask & BITS.BL) !== 0, br = (mask & BITS.BR) !== 0

    const data = new Uint8ClampedArray(center) // start from the center texture
    if (!t) paintEdgeFromTexture(data, edge, s, 0, ew, EDGE_SEED)
    if (!b) paintEdgeFromTexture(data, edge, s, 1, ew, EDGE_SEED)
    if (!l) paintEdgeFromTexture(data, edge, s, 2, ew, EDGE_SEED)
    if (!r) paintEdgeFromTexture(data, edge, s, 3, ew, EDGE_SEED)
    // Inner corners: a single edge pixel at the concave corner
    if (t && l && !tl) copyPixel(data, edge, 0,     0,     s)
    if (t && r && !tr) copyPixel(data, edge, s - 1, 0,     s)
    if (b && l && !bl) copyPixel(data, edge, 0,     s - 1, s)
    if (b && r && !br) copyPixel(data, edge, s - 1, s - 1, s)

    tiles[idx] = new ImageData(data, s, s)
  }
  return tiles
}

// Generates all 48 tiles procedurally for a given biome
// Bounded memo of generated biome sheets. The signature includes colors and
// procedural params (not just an id) so color edits still regenerate. Callers
// treat the 48 ImageData tiles as read-only (compose/export/infer never mutate
// them), which makes returning shared references safe.
const biomeTilesCache = new Map()
// Animation frames share this cache (one entry per frame), so keep headroom
// for a few biomes × up to 4 frames.
const BIOME_CACHE_MAX = 24

function biomeSignature(biome, tileSize, frameSeed) {
  return `${tileSize}|f${frameSeed}|${JSON.stringify(biome.colors)}|${JSON.stringify(biome.proceduralParams || null)}`
}

// `frameSeed` 0 = the static sheet; 1..N = animation frame variants (see drawTile).
export function generateAllBiomeTiles(biome, tileSize, frameSeed = 0) {
  const sig = biomeSignature(biome, tileSize, frameSeed)
  const cached = biomeTilesCache.get(sig)
  if (cached) return cached

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
    tiles[sheetIndex] = drawTile(mask, tileSize, biome.colors, biome.proceduralParams, frameSeed)
  }

  if (biomeTilesCache.size >= BIOME_CACHE_MAX) {
    biomeTilesCache.delete(biomeTilesCache.keys().next().value)
  }
  biomeTilesCache.set(sig, tiles)
  return tiles
}

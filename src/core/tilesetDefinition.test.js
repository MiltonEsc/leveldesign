import test from 'node:test'
import assert from 'node:assert/strict'

if (!globalThis.ImageData) {
  globalThis.ImageData = class ImageData {
    constructor(data, width, height) { this.data = data; this.width = width; this.height = height }
  }
}

const { tilesFromDefinition, framesFromDefinition, applyTileOverrides } = await import('./tilesetDefinition.js')
const { bytesToBase64 } = await import('../lib/serialize.js')

const SIZE = 8

function solidPixels(r, g, b) {
  const px = new Uint8ClampedArray(SIZE * SIZE * 4)
  for (let i = 0; i < px.length; i += 4) { px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255 }
  return px
}

test('applyTileOverrides replaces matching tiles and skips wrong-size entries', () => {
  const tiles = new Array(48).fill(null).map(() => new ImageData(solidPixels(0, 0, 0), SIZE, SIZE))
  const out = applyTileOverrides(tiles, {
    5: solidPixels(255, 0, 0),
    7: new Uint8ClampedArray(4), // wrong size → skipped
    99: solidPixels(0, 255, 0),  // out of range → skipped
  }, SIZE)
  assert.notEqual(out, tiles)         // copy-on-write
  assert.equal(out[5].data[0], 255)   // overridden
  assert.equal(out[7].data[0], 0)     // untouched
  assert.equal(out[4], tiles[4])      // others keep the same reference
  // No applicable overrides → same array back.
  assert.equal(applyTileOverrides(tiles, { 7: new Uint8ClampedArray(4) }, SIZE), tiles)
})

test('definition overrides ride as base64 and replace generated tiles', () => {
  const def = {
    mode: 'procedural',
    biomeId: null,
    overrides: { 5: bytesToBase64(solidPixels(255, 0, 0)) },
  }
  const tiles = tilesFromDefinition(def, SIZE)
  assert.equal(tiles[5].data[0], 255)
  assert.equal(tiles[5].data[1], 0)
  // A sibling definition without overrides differs at that tile.
  const plain = tilesFromDefinition({ mode: 'procedural', biomeId: null }, SIZE)
  assert.notDeepEqual(Array.from(tiles[5].data), Array.from(plain[5].data))
})

test('framesFromDefinition: N-1 deterministic frames for procedural defs only', () => {
  const def = { mode: 'procedural', biomeId: null, animationFrames: 3 }
  const frames = framesFromDefinition(def, SIZE)
  assert.equal(frames.length, 2)
  // Deterministic across calls.
  const again = framesFromDefinition(def, SIZE)
  assert.deepEqual(Array.from(frames[1][1].data), Array.from(again[1][1].data))
  // A frame differs from the static sheet (shimmer + re-scattered edges).
  const base = tilesFromDefinition({ mode: 'procedural', biomeId: null }, SIZE)
  assert.notDeepEqual(Array.from(frames[0][1].data), Array.from(base[1].data))
  // All 48 tiles present per frame.
  assert.equal(frames[0].filter(Boolean).length, 48)
  // Non-procedural or no animation → null.
  assert.equal(framesFromDefinition({ mode: 'draw', basePixels: '', animationFrames: 3 }, SIZE), null)
  assert.equal(framesFromDefinition({ mode: 'textures', centerPixels: '', animationFrames: 3 }, SIZE), null)
  assert.equal(framesFromDefinition({ mode: 'procedural', biomeId: null }, SIZE), null)
})

test('framesFromDefinition keeps hand-edited override tiles static in every frame', () => {
  const def = {
    mode: 'procedural',
    biomeId: null,
    animationFrames: 2,
    overrides: { 5: bytesToBase64(solidPixels(255, 0, 0)) },
  }
  const frames = framesFromDefinition(def, SIZE)
  assert.equal(frames[0][5].data[0], 255) // override applied to the frame too
})

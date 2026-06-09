import test from 'node:test'
import assert from 'node:assert/strict'

if (!globalThis.ImageData) {
  globalThis.ImageData = class ImageData {
    constructor(data, width, height) {
      this.data = data
      this.width = width
      this.height = height
    }
  }
}

const aiTile = await import('./aiTile.js')
const procedural = await import('./proceduralGen.js')

test('buildImageRequestBody uses Gemini image generation defaults', () => {
  const prompt = aiTile.buildTilePrompt({
    subject: 'mossy stone floor',
    role: 'center',
    tileSize: 16,
    paletteHint: {
      primary: '#445533',
      secondary: '#667744',
      border: '#223311',
      highlight: '#99aa66',
      shadow: '#112211',
    },
  })
  const body = aiTile.buildImageRequestBody('gemini-2.5-flash-image', prompt)

  assert.equal(body.meta.model, 'gemini-2.5-flash-image')
  assert.equal(body.meta.quality, 'high')
  assert.equal(body.meta.outputFormat, 'png')
  assert.deepEqual(body.generationConfig.responseModalities, ['IMAGE'])
  assert.equal(body.generationConfig.imageConfig.aspectRatio, '1:1')
  assert.equal(body.generationConfig.responseFormat, undefined)
  assert.match(body.contents[0].parts[0].text, /Center material subject: mossy stone floor/)
  assert.match(body.contents[0].parts[0].text, /readable when downscaled to 16px/)
})

test('providerForModel maps each model to its API provider', () => {
  assert.equal(aiTile.providerForModel('gemini-2.5-flash-image'), 'gemini')
  assert.equal(aiTile.providerForModel('gpt-image-1'), 'openai')
  assert.equal(aiTile.providerForModel('unknown-model'), 'gemini')
})

test('edge prompt includes role-specific border guidance', () => {
  const prompt = aiTile.buildTilePrompt({
    subject: 'icy snow lip',
    role: 'edge',
    contextPrompt: 'dark cave rock',
  })

  assert.match(prompt, /exposed edge or border material/)
  assert.match(prompt, /dark cave rock/)
  assert.match(prompt, /Border material subject: icy snow lip/)
})

test('postprocessTilePixels returns opaque limited-color seamless pixels', () => {
  const w = 16
  const h = 16
  const raw = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      raw[i] = (x * 17 + y * 3) % 256
      raw[i + 1] = (x * 5 + y * 19) % 256
      raw[i + 2] = (x * 11 + y * 7) % 256
      raw[i + 3] = y === 0 ? 120 : 255
    }
  }

  const result = aiTile.postprocessTilePixels(raw, w, h, 16)

  assert.equal(result.pixels.length, 16 * 16 * 4)
  assert.ok(result.meta.colorCount <= 12)
  assert.equal(result.meta.seamScore, 0)
  for (let i = 3; i < result.pixels.length; i += 4) assert.equal(result.pixels[i], 255)
})

test('image-q dithering stays in-palette, opaque, and changes the result vs none', () => {
  const w = 16, h = 16
  const raw = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      raw[i] = (x * 12) % 256          // smooth horizontal gradient → dithering shows
      raw[i + 1] = (y * 12) % 256
      raw[i + 2] = ((x + y) * 6) % 256
      raw[i + 3] = 255
    }
  }
  const none = aiTile.postprocessTilePixels(raw, w, h, 16, { dither: 'nearest' })
  const fs = aiTile.postprocessTilePixels(raw, w, h, 16, { dither: 'floyd-steinberg' })

  assert.ok(fs.meta.colorCount <= 12)
  for (let i = 3; i < fs.pixels.length; i += 4) assert.equal(fs.pixels[i], 255)
  // Dithering must actually alter the pixels relative to plain nearest.
  let differs = false
  for (let i = 0; i < fs.pixels.length; i++) if (fs.pixels[i] !== none.pixels[i]) { differs = true; break }
  assert.ok(differs)
})

test('AI texture composition still creates 48 tiles for all supported grid sizes', () => {
  for (const size of [8, 16, 32, 64]) {
    const center = new Uint8ClampedArray(size * size * 4)
    const edge = new Uint8ClampedArray(size * size * 4)
    for (let i = 0; i < center.length; i += 4) {
      center[i] = 80; center[i + 1] = 120; center[i + 2] = 70; center[i + 3] = 255
      edge[i] = 30; edge[i + 1] = 50; edge[i + 2] = 40; edge[i + 3] = 255
    }

    const tiles = procedural.generateTilesFromTextures(
      new ImageData(center, size, size),
      new ImageData(edge, size, size),
      size,
      { border: '#223311', shadow: '#112211', highlight: '#99aa66' },
    )

    assert.equal(tiles.length, 48)
    assert.equal(tiles.filter(Boolean).length, 48)
    for (const tile of tiles) {
      assert.equal(tile.width, size)
      assert.equal(tile.height, size)
    }
  }
})

test('generateAllBiomeTiles memoizes by colors + params, not just identity', () => {
  const colors = { primary: '#445533', secondary: '#667744', border: '#223311', highlight: '#99aa66', shadow: '#112211' }
  const proceduralParams = { edgeWidth: 2, dither: true, ditherStrength: 0.35, cornerStyle: 'organic' }
  const biome = { colors, proceduralParams }

  const first = procedural.generateAllBiomeTiles(biome, 16)
  const again = procedural.generateAllBiomeTiles({ colors: { ...colors }, proceduralParams }, 16)
  // Same colors + params + size → cached sheet is reused (same array reference).
  assert.equal(first, again)

  // A color edit must bust the cache and regenerate.
  const edited = procedural.generateAllBiomeTiles({ colors: { ...colors, primary: '#ff0000' }, proceduralParams }, 16)
  assert.notEqual(edited, first)
  assert.equal(edited.length, 48)
})

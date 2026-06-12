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
  assert.equal(aiTile.providerForModel('fal-ai/flux/schnell'), 'fal')
  assert.equal(aiTile.providerForModel('fal-ai/flux/dev'), 'fal')
  assert.equal(aiTile.providerForModel('unknown-model'), 'gemini')
})

test('fal prompts are positive caption-style (no negations, no "pixel art" sprite bait)', () => {
  const center = aiTile.buildTilePrompt({
    subject: 'lava rock', role: 'center', tileSize: 32, provider: 'fal',
    paletteHint: { primary: '#aa3311', secondary: '#882200', border: '#441100', highlight: '#ff7733', shadow: '#220800' },
  })
  assert.match(center, /Seamless tileable texture of lava rock/)
  assert.match(center, /every region of the image looks like every other region/)
  assert.match(center, /Color mood:/)
  // FLUX inverts negations — the fal prompt must not contain instruction-style
  // "No ..." / "Avoid ..." phrasing (which the Gemini/OpenAI prompt keeps).
  assert.doesNotMatch(center, /\bAvoid\b|\bNo objects\b/)
  // "pixel art" pushes FLUX toward centered SPRITES; the app's downscale +
  // quantize pipeline pixelizes the result instead, so the words must not appear.
  assert.doesNotMatch(center, /pixel art/i)

  const edge = aiTile.buildTilePrompt({
    subject: 'powder snow', role: 'edge', provider: 'fal', contextPrompt: 'dark cave rock',
  })
  assert.match(edge, /powder snow, used as a terrain border material/)
  assert.match(edge, /matches dark cave rock/)

  // Other providers keep the instruction-style prompt untouched.
  const gemini = aiTile.buildTilePrompt({ subject: 'lava rock', role: 'center', provider: 'gemini' })
  assert.match(gemini, /Avoid drawing an outer border/)
  assert.match(gemini, /Pixel art video-game terrain material/)
})

test('vignetteScore tells uniform textures from centered blobs; crop adapts', () => {
  const size = 128
  const uniform = new Uint8ClampedArray(size * size * 4)
  for (let i = 0; i < uniform.length; i += 4) {
    uniform[i] = 120; uniform[i + 1] = 90; uniform[i + 2] = 60; uniform[i + 3] = 255
  }
  assert.ok(aiTile.vignetteScore(uniform, size, size) < 5)

  // Bright centered blob on a dark background (the FLUX failure mode).
  const blob = new Uint8ClampedArray(size * size * 4)
  const c = size / 2, r = size * 0.3
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const inside = (x - c) ** 2 + (y - c) ** 2 < r * r
      blob[i] = inside ? 220 : 20
      blob[i + 1] = inside ? 200 : 25
      blob[i + 2] = inside ? 90 : 35
      blob[i + 3] = 255
    }
  }
  assert.ok(aiTile.vignetteScore(blob, size, size) > 48)
  // Blob → tighter crop than a uniform texture.
  assert.ok(aiTile.pickFalCropFraction(blob, size, size) < aiTile.pickFalCropFraction(uniform, size, size))
})

test('cropCenterRgba keeps the central region', () => {
  // 4×4 image whose central 2×2 pixels are marked 255.
  const w = 4, h = 4
  const data = new Uint8ClampedArray(w * h * 4)
  for (const [x, y] of [[1, 1], [2, 1], [1, 2], [2, 2]]) data[(y * w + x) * 4] = 255
  const { data: out, width, height } = aiTile.cropCenterRgba(data, w, h, 0.5)
  assert.equal(width, 2)
  assert.equal(height, 2)
  for (let i = 0; i < out.length; i += 4) assert.equal(out[i], 255)
  // frac >= 1 → untouched passthrough (same reference, same dims)
  const same = aiTile.cropCenterRgba(data, w, h, 1)
  assert.equal(same.data, data)
  assert.equal(same.width, w)
})

test('buildFalRequestBody requests inline sync_mode square images', () => {
  const png = aiTile.buildFalRequestBody('fal-ai/flux/schnell', 'lava rock', { outputFormat: 'png' })
  assert.equal(png.prompt, 'lava rock')
  assert.equal(png.image_size, 'square_hd')
  assert.equal(png.num_images, 1)
  assert.equal(png.sync_mode, true)            // returns a data-URI, not a CDN url
  assert.equal(png.output_format, 'png')
  assert.equal(png.num_inference_steps, undefined) // schnell keeps its own default

  // Any non-png outputFormat falls back to jpeg.
  const jpg = aiTile.buildFalRequestBody('fal-ai/flux/dev', 'lava rock', { outputFormat: 'webp' })
  assert.equal(jpg.output_format, 'jpeg')
  // Default (no opts) is png per DEFAULT_OUTPUT_FORMAT.
  assert.equal(aiTile.buildFalRequestBody('fal-ai/flux/schnell', 'x').output_format, 'png')
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

test('synthesized edge (no edge texture) derives from the center, not the palette', () => {
  const size = 16
  // Red "lava" center WITH a white artifact band in its bottom rows (AI images
  // often carry bands/watermark remnants at their boundary); the active palette
  // is deliberately green.
  const center = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const artifact = y >= size - 2
      center[i] = artifact ? 255 : 200
      center[i + 1] = artifact ? 255 : 40
      center[i + 2] = artifact ? 255 : 30
      center[i + 3] = 255
    }
  }
  const tiles = procedural.generateTilesFromTextures(
    new ImageData(center, size, size),
    null, // no edge texture → synthesized
    size,
    { border: '#223311', shadow: '#112211', highlight: '#99aa66' }, // green palette must NOT leak in
  )
  // Index 1 = the isolated tile (bitmask 0): every edge is painted. Corner
  // pixels must be a darkened red — never the palette's green, and never the
  // artifact's white copied from the center's boundary rows.
  const px = tiles[1].data
  const top = [px[0], px[1], px[2]]
  const bi = ((size - 1) * size) * 4 // bottom-left corner
  const bottom = [px[bi], px[bi + 1], px[bi + 2]]
  for (const [r, g, b] of [top, bottom]) {
    assert.ok(r > g, 'edge keeps the center hue (red > green)')
    assert.ok(r > b, 'edge keeps the center hue (red > blue)')
    assert.ok(r < 200, 'edge is darker than the center')
    assert.ok(r > 0, 'edge is not black')
    assert.ok(g < 150, 'edge does not copy the white artifact band')
  }
  // An explicit edge texture still wins over synthesis.
  const blue = new Uint8ClampedArray(size * size * 4)
  for (let i = 0; i < blue.length; i += 4) { blue[i + 2] = 220; blue[i + 3] = 255 }
  const withEdge = procedural.generateTilesFromTextures(
    new ImageData(center, size, size), new ImageData(blue, size, size), size, {},
  )
  assert.ok(withEdge[1].data[2] > withEdge[1].data[0], 'explicit edge texture is used as-is')
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

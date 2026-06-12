// AI base-tile generation. Supports two providers, picked per model:
//   - Gemini (Google Generative Language API)
//   - OpenAI (Images API, gpt-image family)
// In dev, requests go through Vite proxies (/gemini, /openai) to avoid CORS.
// API keys are read ONLY from .env.local (never from the UI). See resolveApiKey.
//
// This module is only reached through the lazy AI panels, so image-q rides in
// the lazy AI chunk (not the initial bundle).
import { utils as iqUtils, buildPaletteSync, applyPaletteSync } from 'image-q'

// Dithering modes exposed in the AI tile panels (UI label → image-q mode).
export const DITHER_OPTIONS = [
  { value: 'nearest',         label: 'Off' },
  { value: 'floyd-steinberg', label: 'Floyd–Steinberg' },
  { value: 'atkinson',        label: 'Atkinson' },
]
const DEFAULT_DITHER = 'nearest'
const QUANT_FORMULA = 'euclidean-bt709'
// Exported so the text-generation path (aiText.js) reuses the same dev proxies.
export const GEMINI_BASE = import.meta.env?.DEV ? '/gemini/v1beta' : 'https://generativelanguage.googleapis.com/v1beta'
export const OPENAI_BASE = import.meta.env?.DEV ? '/openai/v1' : 'https://api.openai.com/v1'
// fal.ai (FLUX). Synchronous endpoint: POST /<model> returns the image inline
// (a data-URI) when sync_mode is set, so no polling / CDN-CORS handling needed.
export const FAL_BASE = import.meta.env?.DEV ? '/fal' : 'https://fal.run'
const DEFAULT_IMAGE_MODEL = 'gemini-2.5-flash-image'
const FALLBACK_IMAGE_MODEL = 'gemini-2.5-flash-image'
const DEFAULT_QUALITY = 'high'
const DEFAULT_OUTPUT_FORMAT = 'png'
const MAX_TILE_COLORS = 10

export const AI_MODELS = [
  { id: 'gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image', provider: 'gemini' },
  { id: 'gemini-3-pro-image',     label: 'Gemini 3 Pro Image',     provider: 'gemini' },
  { id: 'gpt-image-1',            label: 'GPT Image 1',            provider: 'openai' },
  { id: 'gpt-image-1-mini',       label: 'GPT Image 1 Mini',       provider: 'openai' },
  { id: 'fal-ai/flux/schnell',    label: 'FLUX.1 schnell (fal)',   provider: 'fal' },
  { id: 'fal-ai/flux/dev',        label: 'FLUX.1 dev (fal)',       provider: 'fal' },
]

export function providerForModel(model) {
  return AI_MODELS.find(m => m.id === model)?.provider || 'gemini'
}

// Keys live only in .env.local (git-ignored). VITE_* vars are still embedded in
// the client bundle at build time, so this is "not shown in the UI", not secret.
export function resolveApiKey(provider) {
  const env = import.meta.env || {}
  if (provider === 'openai') return env.VITE_OPENAI_API_KEY || ''
  if (provider === 'fal') return env.VITE_FAL_API_KEY || ''
  return env.VITE_GEMINI_API_KEY || ''
}

export function buildTilePrompt({
  subject,
  role = 'center',
  tileSize = 16,
  paletteHint = null,
  contextPrompt = '',
  provider = 'gemini',
}) {
  const cleanedSubject = (subject || '').trim()
  const palette = paletteHint
    ? [
        paletteHint.primary,
        paletteHint.secondary,
        paletteHint.border,
        paletteHint.highlight,
        paletteHint.shadow,
      ].filter(Boolean).join(', ')
    : ''

  // FLUX (fal) ignores instruction-style prompts, and negations backfire: with
  // T5/CLIP conditioning, mentioning "border" — even as "avoid drawing a
  // border" — INCREASES the chance of a drawn border/vignette. Crucially,
  // asking FLUX for "pixel art" pushes it toward SPRITES (a centered subject on
  // a background), which breaks autotiling. So the fal prompt asks for a
  // realistic/painted MATERIAL texture instead — the app's own downscale +
  // sharpen + quantize pipeline is what turns it into pixel art — phrased as a
  // positive caption with texture-map anchors FLUX understands well.
  if (provider === 'fal') {
    const material = role === 'edge'
      ? `${cleanedSubject}, used as a terrain border material${contextPrompt ? ` that visually matches ${contextPrompt.trim()}` : ''}`
      : cleanedSubject
    return [
      `Seamless tileable texture of ${material}.`,
      'Video game terrain texture map: a flat, top-down macro view of the material surface only.',
      'The same uniform surface detail repeats across the entire square image;',
      'every region of the image looks like every other region,',
      'and the pattern flows continuously past all four edges.',
      'Even, flat lighting across the whole frame.',
      `Bold, chunky surface details in a limited color palette, still readable when shrunk to a ${tileSize} pixel game tile.`,
      palette ? `Color mood: ${palette}.` : '',
    ].filter(Boolean).join(' ')
  }

  const shared = [
    'Pixel art video-game terrain material.',
    'Top-down orthographic view.',
    'Seamless tileable square texture.',
    'No objects, characters, icons, text, labels, shadows, UI, or perspective.',
    'Large readable pixel clusters, limited palette, crisp material identity.',
    `Must remain readable when downscaled to ${tileSize}px.`,
    palette ? `Use this color mood as guidance, not as exact text: ${palette}.` : '',
  ].filter(Boolean)

  if (role === 'edge') {
    return [
      ...shared,
      'Generate the exposed edge or border material for an autotile.',
      'Use slightly stronger contrast than the center material.',
      contextPrompt ? `It must visually match this center material: ${contextPrompt.trim()}.` : '',
      `Border material subject: ${cleanedSubject}`,
    ].filter(Boolean).join(' ')
  }

  return [
    ...shared,
    'Generate the center fill material only.',
    'Avoid drawing an outer border; the app will compose autotile borders separately.',
    `Center material subject: ${cleanedSubject}`,
  ].join(' ')
}

// Gemini image request body. Note: the field is `imageConfig` (NOT
// `responseFormat`, which the API rejects with "Unknown name responseFormat"),
// and `responseModalities` requires the v1beta endpoint.
export function buildImageRequestBody(model, prompt, {
  quality = DEFAULT_QUALITY,
  outputFormat = DEFAULT_OUTPUT_FORMAT,
} = {}) {
  return {
    contents: [{
      parts: [{ text: prompt }],
    }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: {
        aspectRatio: '1:1',
      },
    },
    meta: {
      model,
      quality,
      outputFormat,
    },
  }
}

async function requestGeminiImage(apiKey, body) {
  const model = body?.meta?.model || DEFAULT_IMAGE_MODEL
  const { meta, ...requestBody } = body
  return fetch(`${GEMINI_BASE}/models/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(requestBody),
  })
}

function openAISize(quality) {
  // gpt-image models only accept fixed sizes; 1:1 square for tiles/props.
  return '1024x1024'
}

async function requestOpenAIImage(apiKey, model, prompt, { quality = DEFAULT_QUALITY } = {}) {
  return fetch(`${OPENAI_BASE}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      size: openAISize(quality),
      quality,
    }),
  })
}

// fal.ai (FLUX) request body. `sync_mode: true` makes fal.run return the image
// inline as a data-URI instead of uploading it to a CDN, so we never deal with
// polling or cross-origin canvas tainting. schnell uses 4 steps by default; we
// don't pin num_inference_steps so each FLUX variant keeps its own default.
export function buildFalRequestBody(model, prompt, { outputFormat = DEFAULT_OUTPUT_FORMAT } = {}) {
  return {
    prompt,
    image_size: 'square_hd', // 1024×1024, matches the OpenAI square path
    num_images: 1,
    sync_mode: true,
    enable_safety_checker: true,
    output_format: outputFormat === 'png' ? 'png' : 'jpeg',
  }
}

async function requestFalImage(apiKey, model, prompt, { outputFormat = DEFAULT_OUTPUT_FORMAT } = {}) {
  return fetch(`${FAL_BASE}/${model}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${apiKey}`,
    },
    body: JSON.stringify(buildFalRequestBody(model, prompt, { outputFormat })),
  })
}

const PROVIDER_LABEL = { openai: 'OpenAI', fal: 'fal', gemini: 'Gemini' }

async function readError(res, provider) {
  let msg = `${PROVIDER_LABEL[provider] || 'Gemini'} request failed (HTTP ${res.status}).`
  try {
    const err = await res.json()
    // Gemini/OpenAI use { error: { message } }; fal uses { detail } (string or
    // an array of validation issues) or { message }.
    if (err?.error?.message) msg = err.error.message
    else if (typeof err?.detail === 'string') msg = err.detail
    else if (Array.isArray(err?.detail) && err.detail[0]?.msg) msg = err.detail[0].msg
    else if (err?.message) msg = err.message
  } catch {
    // Ignore parse error.
  }
  return msg
}

function decodeGeneratedImage(src, crossOrigin) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    if (crossOrigin) img.crossOrigin = 'anonymous'
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      const ctx = c.getContext('2d')
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(img, 0, 0)
      try {
        const id = ctx.getImageData(0, 0, c.width, c.height)
        resolve({
          data: new Uint8ClampedArray(id.data),
          width: c.width,
          height: c.height,
        })
      } catch {
        reject(new Error('Could not read the Gemini image response. Check browser CORS or model access.'))
      }
    }
    img.onerror = () => reject(new Error('Failed to load the generated image.'))
    img.src = src
  })
}

function findGeminiInlineImage(json) {
  const candidates = json?.candidates || []
  for (const candidate of candidates) {
    const parts = candidate?.content?.parts || candidate?.parts || []
    for (const part of parts) {
      const inline = part.inlineData || part.inline_data
      if (inline?.data) return inline
    }
  }

  const parts = json?.content?.parts || json?.parts || []
  for (const part of parts) {
    const inline = part.inlineData || part.inline_data
    if (inline?.data) return inline
  }

  return null
}

async function runGeminiAttempt(apiKey, model, prompt, { quality, outputFormat }) {
  const body = buildImageRequestBody(model, prompt, { quality, outputFormat })
  const attemptBody = { ...body, meta: { ...body.meta, model } }
  const res = await requestGeminiImage(apiKey, attemptBody)
  if (!res.ok) throw new Error(await readError(res, 'gemini'))

  const json = await res.json()
  const inline = findGeminiInlineImage(json)
  if (!inline) throw new Error('No image returned by the Gemini API.')

  const mimeType = inline.mimeType || inline.mime_type || 'image/png'
  const decoded = await decodeGeneratedImage(`data:${mimeType};base64,${inline.data}`, false)
  return { decoded, mimeType }
}

async function runOpenAIAttempt(apiKey, model, prompt, { quality }) {
  const res = await requestOpenAIImage(apiKey, model, prompt, { quality })
  if (!res.ok) throw new Error(await readError(res, 'openai'))

  const json = await res.json()
  const b64 = json?.data?.[0]?.b64_json
  if (!b64) throw new Error('No image returned by the OpenAI API.')

  const mimeType = 'image/png'
  const decoded = await decodeGeneratedImage(`data:${mimeType};base64,${b64}`, false)
  return { decoded, mimeType }
}

async function runFalAttempt(apiKey, model, prompt, { outputFormat }) {
  const res = await requestFalImage(apiKey, model, prompt, { outputFormat })
  if (!res.ok) throw new Error(await readError(res, 'fal'))

  const json = await res.json()
  const img = json?.images?.[0]
  const url = img?.url
  if (!url) throw new Error('No image returned by the fal API.')

  const mimeType = img.content_type || 'image/png'
  // With sync_mode the url is a data-URI (no CORS); a CDN url needs crossOrigin.
  const decoded = await decodeGeneratedImage(url, !url.startsWith('data:'))
  return { decoded, mimeType }
}

// Generic image generation. Picks the provider from the model id and resolves
// the API key from .env.local (VITE_GEMINI_API_KEY / VITE_OPENAI_API_KEY).
export async function generateImage({
  prompt,
  model = DEFAULT_IMAGE_MODEL,
  quality = DEFAULT_QUALITY,
  outputFormat = DEFAULT_OUTPUT_FORMAT,
}) {
  const provider = providerForModel(model)
  const apiKey = resolveApiKey(provider)
  if (!apiKey) {
    const envVar = { openai: 'VITE_OPENAI_API_KEY', fal: 'VITE_FAL_API_KEY' }[provider] || 'VITE_GEMINI_API_KEY'
    throw new Error(`Missing ${envVar} in .env.local for the selected model.`)
  }

  // Gemini gets a same-provider fallback model; OpenAI/fal do not.
  const attempts = provider === 'gemini' && model === DEFAULT_IMAGE_MODEL && FALLBACK_IMAGE_MODEL !== model
    ? [model, FALLBACK_IMAGE_MODEL]
    : [model]
  let lastError = null

  for (const attemptModel of attempts) {
    try {
      const { decoded, mimeType } =
        provider === 'openai' ? await runOpenAIAttempt(apiKey, attemptModel, prompt, { quality })
        : provider === 'fal'  ? await runFalAttempt(apiKey, attemptModel, prompt, { outputFormat })
        : await runGeminiAttempt(apiKey, attemptModel, prompt, { quality, outputFormat })
      return {
        ...decoded,
        meta: {
          provider,
          model: attemptModel,
          requestedModel: model,
          fallbackFrom: attemptModel !== model ? model : null,
          quality,
          outputFormat,
          mimeType,
        },
      }
    } catch (e) {
      lastError = e
    }
  }

  throw lastError || new Error('Image generation failed.')
}

function resizeRgbaArea(data, srcW, srcH, dstW, dstH) {
  if (srcW === dstW && srcH === dstH) return new Uint8ClampedArray(data)
  const out = new Uint8ClampedArray(dstW * dstH * 4)
  for (let dy = 0; dy < dstH; dy++) {
    const y0 = Math.floor((dy * srcH) / dstH)
    const y1 = Math.max(y0 + 1, Math.floor(((dy + 1) * srcH) / dstH))
    for (let dx = 0; dx < dstW; dx++) {
      const x0 = Math.floor((dx * srcW) / dstW)
      const x1 = Math.max(x0 + 1, Math.floor(((dx + 1) * srcW) / dstW))
      let r = 0, g = 0, b = 0, a = 0, count = 0
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * srcW + sx) * 4
          r += data[i]
          g += data[i + 1]
          b += data[i + 2]
          a += data[i + 3]
          count++
        }
      }
      const o = (dy * dstW + dx) * 4
      out[o] = Math.round(r / count)
      out[o + 1] = Math.round(g / count)
      out[o + 2] = Math.round(b / count)
      out[o + 3] = Math.round(a / count)
    }
  }
  return out
}

const clampByte = (v) => Math.max(0, Math.min(255, Math.round(v)))

function sharpenPixels(data, w, h, amount = 0.38) {
  const out = new Uint8ClampedArray(data)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      let br = 0, bg = 0, bb = 0, samples = 0
      for (let dy = -1; dy <= 1; dy++) {
        const sy = y + dy
        if (sy < 0 || sy >= h) continue
        for (let dx = -1; dx <= 1; dx++) {
          const sx = x + dx
          if (sx < 0 || sx >= w) continue
          const bi = (sy * w + sx) * 4
          br += data[bi]
          bg += data[bi + 1]
          bb += data[bi + 2]
          samples++
        }
      }
      br /= samples
      bg /= samples
      bb /= samples
      out[i] = clampByte(data[i] + (data[i] - br) * amount)
      out[i + 1] = clampByte(data[i + 1] + (data[i + 1] - bg) * amount)
      out[i + 2] = clampByte(data[i + 2] + (data[i + 2] - bb) * amount)
      out[i + 3] = 255
    }
  }
  return out
}

function nearestPaletteColor(r, g, b, palette) {
  let best = palette[0]
  let bestDist = Number.POSITIVE_INFINITY
  for (const c of palette) {
    const dr = r - c[0]
    const dg = g - c[1]
    const db = b - c[2]
    const dist = dr * dr + dg * dg + db * db
    if (dist < bestDist) {
      bestDist = dist
      best = c
    }
  }
  return best
}

// Quantize to <= maxColors using image-q (Wu palette + optional dithering),
// replacing the hand-rolled median cut. Returns the quantized RGBA plus the
// actually-used palette as [[r,g,b]] (for seam repair) — same shape as before.
function quantizePixels(data, w, h, maxColors = MAX_TILE_COLORS, dither = DEFAULT_DITHER) {
  const pc = iqUtils.PointContainer.fromUint8Array(data, w, h)
  const palette = buildPaletteSync([pc], {
    colors: maxColors,
    paletteQuantization: 'wuquant',
    colorDistanceFormula: QUANT_FORMULA,
  })
  const outPc = applyPaletteSync(pc, palette, {
    imageQuantization: dither,
    colorDistanceFormula: QUANT_FORMULA,
  })
  const out = new Uint8ClampedArray(outPc.toUint8Array())
  for (let i = 3; i < out.length; i += 4) out[i] = 255 // keep tiles opaque

  const seen = new Set()
  const pal = []
  for (let i = 0; i < out.length; i += 4) {
    const key = (out[i] << 16) | (out[i + 1] << 8) | out[i + 2]
    if (!seen.has(key)) { seen.add(key); pal.push([out[i], out[i + 1], out[i + 2]]) }
  }
  return { data: out, palette: pal, colorCount: pal.length }
}

export function measureSeamScore(data, w, h) {
  let total = 0
  let samples = 0
  for (let x = 0; x < w; x++) {
    const top = x * 4
    const bottom = ((h - 1) * w + x) * 4
    total += Math.abs(data[top] - data[bottom])
      + Math.abs(data[top + 1] - data[bottom + 1])
      + Math.abs(data[top + 2] - data[bottom + 2])
    samples += 3
  }
  for (let y = 0; y < h; y++) {
    const left = (y * w) * 4
    const right = (y * w + w - 1) * 4
    total += Math.abs(data[left] - data[right])
      + Math.abs(data[left + 1] - data[right + 1])
      + Math.abs(data[left + 2] - data[right + 2])
    samples += 3
  }
  return samples ? Number((total / samples).toFixed(2)) : 0
}

function repairSeams(data, w, h, palette = null) {
  const out = new Uint8ClampedArray(data)
  for (let x = 0; x < w; x++) {
    const top = x * 4
    const bottom = ((h - 1) * w + x) * 4
    const snapped = palette
      ? nearestPaletteColor(
          Math.round((out[top] + out[bottom]) / 2),
          Math.round((out[top + 1] + out[bottom + 1]) / 2),
          Math.round((out[top + 2] + out[bottom + 2]) / 2),
          palette,
        )
      : null
    for (let c = 0; c < 3; c++) {
      const avg = snapped ? snapped[c] : Math.round((out[top + c] + out[bottom + c]) / 2)
      out[top + c] = avg
      out[bottom + c] = avg
    }
    out[top + 3] = 255
    out[bottom + 3] = 255
  }
  for (let y = 0; y < h; y++) {
    const left = (y * w) * 4
    const right = (y * w + w - 1) * 4
    const snapped = palette
      ? nearestPaletteColor(
          Math.round((out[left] + out[right]) / 2),
          Math.round((out[left + 1] + out[right + 1]) / 2),
          Math.round((out[left + 2] + out[right + 2]) / 2),
          palette,
        )
      : null
    for (let c = 0; c < 3; c++) {
      const avg = snapped ? snapped[c] : Math.round((out[left + c] + out[right + c]) / 2)
      out[left + c] = avg
      out[right + c] = avg
    }
    out[left + 3] = 255
    out[right + 3] = 255
  }
  return out
}

export function postprocessTilePixels(rawPixels, rawWidth, rawHeight, tileSize, {
  maxColors = MAX_TILE_COLORS,
  dither = DEFAULT_DITHER,
} = {}) {
  let pixels = resizeRgbaArea(rawPixels, rawWidth, rawHeight, tileSize, tileSize)
  for (let i = 0; i < pixels.length; i += 4) pixels[i + 3] = 255
  pixels = sharpenPixels(pixels, tileSize, tileSize)
  pixels = repairSeams(pixels, tileSize, tileSize)
  const quantized = quantizePixels(pixels, tileSize, tileSize, Math.max(8, Math.min(12, maxColors)), dither)
  pixels = repairSeams(quantized.data, tileSize, tileSize, quantized.palette)
  const colorCount = new Set(Array.from({ length: pixels.length / 4 }, (_, idx) => {
    const i = idx * 4
    return `${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`
  })).size

  return {
    pixels,
    meta: {
      seamScore: measureSeamScore(pixels, tileSize, tileSize),
      colorCount,
    },
  }
}

// Keep the central fraction of an RGBA image (returns { data, width, height }).
// Exported for tests.
export function cropCenterRgba(data, width, height, frac) {
  if (!frac || frac >= 1) return { data, width, height }
  const cw = Math.max(1, Math.round(width * frac))
  const ch = Math.max(1, Math.round(height * frac))
  const x0 = (width - cw) >> 1
  const y0 = (height - ch) >> 1
  const out = new Uint8ClampedArray(cw * ch * 4)
  for (let y = 0; y < ch; y++) {
    const src = ((y0 + y) * width + x0) * 4
    out.set(data.subarray(src, src + cw * 4), y * cw * 4)
  }
  return { data: out, width: cw, height: ch }
}

// FLUX biases hard toward centered compositions with vignettes/frames even
// when prompted for a uniform texture; keeping only the central region cuts
// that off before the downscale (the result is still ≥38× the largest tile).
const FAL_CENTER_CROP = 0.6
// When the image is clearly a centered blob/vignette (centre colour far from
// the outer ring's), crop harder so we sample the blob's interior material.
const FAL_BLOB_CROP = 0.4
const VIGNETTE_THRESHOLD = 48

// Mean RGB distance between the image's central box (middle 30%) and its outer
// ring (outermost 12%). Uniform textures score near 0; centered blob/vignette
// compositions score high. Sampled with a stride for speed. Exported for tests.
export function vignetteScore(data, width, height) {
  const cx0 = Math.floor(width * 0.35), cx1 = Math.ceil(width * 0.65)
  const cy0 = Math.floor(height * 0.35), cy1 = Math.ceil(height * 0.65)
  const ring = Math.max(1, Math.floor(Math.min(width, height) * 0.12))
  const step = Math.max(1, Math.floor(Math.min(width, height) / 128))
  let cr = 0, cg = 0, cb = 0, cn = 0
  let rr = 0, rg = 0, rb = 0, rn = 0
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4
      if (x >= cx0 && x < cx1 && y >= cy0 && y < cy1) {
        cr += data[i]; cg += data[i + 1]; cb += data[i + 2]; cn++
      } else if (x < ring || x >= width - ring || y < ring || y >= height - ring) {
        rr += data[i]; rg += data[i + 1]; rb += data[i + 2]; rn++
      }
    }
  }
  if (!cn || !rn) return 0
  const dr = cr / cn - rr / rn
  const dg = cg / cn - rg / rn
  const db = cb / cn - rb / rn
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

// Crop fraction for a fal image: tighter when it reads as a centered blob.
// Exported for tests.
export function pickFalCropFraction(data, width, height) {
  return vignetteScore(data, width, height) > VIGNETTE_THRESHOLD ? FAL_BLOB_CROP : FAL_CENTER_CROP
}

export async function generateBaseTileWithAI({
  prompt,
  model = DEFAULT_IMAGE_MODEL,
  tileSize,
  quality = DEFAULT_QUALITY,
  outputFormat = DEFAULT_OUTPUT_FORMAT,
  role = 'center',
  paletteHint = null,
  contextPrompt = '',
  dither = DEFAULT_DITHER,
}) {
  if (!prompt || !prompt.trim()) throw new Error('Enter a prompt describing the tile.')

  const provider = providerForModel(model)
  const finalPrompt = buildTilePrompt({ subject: prompt, role, tileSize, paletteHint, contextPrompt, provider })
  const decoded = await generateImage({ prompt: finalPrompt, model, quality, outputFormat })
  // Props keep the full frame (a centered subject is the point there); this
  // crop only runs on the tile path, for fal images. The fraction adapts:
  // tighter when the image reads as a centered blob/vignette.
  const source = decoded.meta.provider === 'fal'
    ? cropCenterRgba(decoded.data, decoded.width, decoded.height,
        pickFalCropFraction(decoded.data, decoded.width, decoded.height))
    : decoded
  const processed = postprocessTilePixels(source.data, source.width, source.height, tileSize, { dither })

  return {
    pixels: processed.pixels,
    rawPixels: decoded.data,
    meta: {
      ...decoded.meta,
      role,
      prompt: finalPrompt,
      rawSize: `${decoded.width}x${decoded.height}`,
      tileSize,
      seamScore: processed.meta.seamScore,
      colorCount: processed.meta.colorCount,
    },
  }
}

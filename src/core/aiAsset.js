// AI scenery-prop generation via the OpenAI Images API.
// Unlike aiTile.js (opaque terrain tiles), props need a TRANSPARENT background
// and non-square dimensions (cols×rows cells). In dev, requests go through the
// Vite proxy (/openai) to avoid CORS.
import { AI_MODELS } from './aiTile.js'

export { AI_MODELS }

const API_BASE = import.meta.env.DEV ? '/openai/v1' : 'https://api.openai.com/v1'

const STYLE_BASE =
  'Low-resolution pixel art game sprite of a single centered object. ' +
  'Flat solid colors, limited palette, clean readable silhouette, hard blocky pixel edges. ' +
  'NO anti-aliasing, NO blur, NO soft shading, NO gradients, NO noise, NO outline speckles. '
// Background clause depends on whether the model supports a real alpha channel.
const BG_TRANSPARENT = 'Transparent background, no ground, no cast shadow, no text. Subject: '
const BG_SOLID = 'Plain solid flat magenta (#FF00FF) background filling all empty space, no ground, no cast shadow, no text. Subject: '

// Corner-sampled chroma key: for models without native transparency, make
// pixels close to the sampled background color fully transparent.
const CHROMA_TOLERANCE = 60

// Color bands per RGB channel after downscaling. Lower = flatter / more
// stylized; higher = more color fidelity but softer. 6 is a good pixel-art middle.
const POSTERIZE_LEVELS = 6

function buildBody(model, prompt, transparent) {
  const body = { model, prompt, size: '1024x1024', n: 1, quality: 'low' }
  if (transparent) body.background = 'transparent'
  return body
}

async function requestImage(apiKey, body) {
  return fetch(`${API_BASE}/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  })
}

async function readError(res) {
  let msg = `OpenAI request failed (HTTP ${res.status}).`
  try {
    const err = await res.json()
    if (err?.error?.message) msg = err.error.message
  } catch { /* ignore parse error */ }
  return msg
}

// Removes a near-uniform background by sampling the 4 corners (for opaque models).
function chromaKey(data, w, h, tolerance = CHROMA_TOLERANCE) {
  const corners = [
    [0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1],
  ].map(([x, y]) => {
    const i = (y * w + x) * 4
    return [data[i], data[i + 1], data[i + 2]]
  })
  // Average corner color as the background reference
  const bg = [0, 1, 2].map(c => Math.round(corners.reduce((s, p) => s + p[c], 0) / corners.length))

  for (let i = 0; i < data.length; i += 4) {
    const dr = data[i] - bg[0]
    const dg = data[i + 1] - bg[1]
    const db = data[i + 2] - bg[2]
    if (Math.sqrt(dr * dr + dg * dg + db * db) <= tolerance) {
      data[i + 3] = 0
    }
  }
}

// Removes the magenta halo left by anti-aliased edges over the chroma-key
// background: pixels where red AND blue clearly dominate green are magenta-tinted.
function deFringeMagenta(data) {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    const r = data[i], g = data[i + 1], b = data[i + 2]
    if (r - g > 60 && b - g > 60) data[i + 3] = 0
  }
}

// Quantizes each RGB channel of opaque pixels to `levels` steps. AI images come
// with soft gradient shading that looks blurry when scaled up; flattening to a
// few color bands makes the sprite read as crisp, deliberate pixel art.
function posterize(data, levels = POSTERIZE_LEVELS) {
  const step = 255 / (levels - 1)
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    data[i]     = Math.round(Math.round(data[i]     / step) * step)
    data[i + 1] = Math.round(Math.round(data[i + 1] / step) * step)
    data[i + 2] = Math.round(Math.round(data[i + 2] / step) * step)
  }
}

// Progressively halves a source image down toward the target size. A single
// huge drawImage (e.g. 1024→32) uses bilinear sampling that looks blurry and
// washes out alpha; halving in 2× steps averages cleanly and stays crisp.
function stepDownToCanvas(img, pxW, pxH) {
  let curW = img.width
  let curH = img.height
  let src = img
  // Halve until within 2× of the target, then do the final resize.
  while (curW > pxW * 2 && curH > pxH * 2) {
    const nextW = Math.max(pxW, Math.floor(curW / 2))
    const nextH = Math.max(pxH, Math.floor(curH / 2))
    const tmp = document.createElement('canvas')
    tmp.width = nextW
    tmp.height = nextH
    const tctx = tmp.getContext('2d')
    tctx.imageSmoothingEnabled = true
    tctx.imageSmoothingQuality = 'high'
    tctx.drawImage(src, 0, 0, curW, curH, 0, 0, nextW, nextH)
    src = tmp
    curW = nextW
    curH = nextH
  }
  const out = document.createElement('canvas')
  out.width = pxW
  out.height = pxH
  const octx = out.getContext('2d')
  octx.imageSmoothingEnabled = true
  octx.imageSmoothingQuality = 'high'
  octx.clearRect(0, 0, pxW, pxH)
  octx.drawImage(src, 0, 0, curW, curH, 0, 0, pxW, pxH)
  return out
}

// Downscales an image to pxW×pxH RGBA. If `keyOut` is true, applies corner
// chroma-keying first (for models that return opaque images). Colors are
// posterized for a crisp look; alpha is left CONTINUOUS so the user can choose
// how aggressively to solidify edges afterward (see the Solidify control).
function downscaleToAsset(src, pxW, pxH, crossOrigin, keyOut) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    if (crossOrigin) img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = stepDownToCanvas(img, pxW, pxH)
      const ctx = canvas.getContext('2d')
      try {
        const id = ctx.getImageData(0, 0, pxW, pxH)
        if (keyOut) { chromaKey(id.data, pxW, pxH); deFringeMagenta(id.data) }
        posterize(id.data)
        resolve(new Uint8ClampedArray(id.data))
      } catch {
        reject(new Error('Could not read the image (CORS). Try the gpt-image-1 model.'))
      }
    }
    img.onerror = () => reject(new Error('Failed to load the generated image.'))
    img.src = src
  })
}

export async function generateAssetWithAI({ prompt, apiKey, model = 'gpt-image-1', pxW, pxH }) {
  if (!apiKey) throw new Error('Missing OpenAI API key.')
  if (!prompt || !prompt.trim()) throw new Error('Enter a prompt describing the prop.')
  const subject = prompt.trim()

  // First try a native transparent background.
  let res = await requestImage(apiKey, buildBody(model, STYLE_BASE + BG_TRANSPARENT + subject, true))
  let keyOut = false

  // Some models (e.g. gpt-image-2) don't support transparent background. Fall
  // back to a solid magenta background and chroma-key it out. A failed 400
  // request isn't billed, so this retry doesn't add real cost.
  if (!res.ok) {
    const msg = await readError(res)
    if (/transparent|background/i.test(msg)) {
      res = await requestImage(apiKey, buildBody(model, STYLE_BASE + BG_SOLID + subject, false))
      keyOut = true
      if (!res.ok) throw new Error(await readError(res))
    } else {
      throw new Error(msg)
    }
  }

  const json = await res.json()
  const item = json?.data?.[0]
  if (!item) throw new Error('No image returned by the API.')

  if (item.b64_json) {
    return downscaleToAsset(`data:image/png;base64,${item.b64_json}`, pxW, pxH, false, keyOut)
  }
  if (item.url) {
    return downscaleToAsset(item.url, pxW, pxH, true, keyOut)
  }
  throw new Error('No image data in the API response.')
}

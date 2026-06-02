// AI scenery-prop generation via the OpenAI Images API.
// Unlike aiTile.js (opaque terrain tiles), props need a TRANSPARENT background
// and non-square dimensions (cols×rows cells). In dev, requests go through the
// Vite proxy (/openai) to avoid CORS.
import { AI_MODELS } from './aiTile.js'

export { AI_MODELS }

const API_BASE = import.meta.env.DEV ? '/openai/v1' : 'https://api.openai.com/v1'

const STYLE_PREFIX_ASSET =
  'Pixel art video-game prop sprite, single centered object, transparent background, ' +
  'no ground, no shadow, no border, no text, flat shading, crisp pixels. Subject: '

// Corner-sampled chroma key: for models without native transparency (dall-e),
// make pixels close to the sampled background color fully transparent.
const CHROMA_TOLERANCE = 28

// Below this alpha a downscaled pixel is treated as background (cleared);
// at/above it the pixel is snapped to fully opaque. Removes the blurry,
// semi-transparent "ghost" halo and keeps sprites crisp and solid.
const ALPHA_THRESHOLD = 110

function buildBody(model, prompt) {
  if (model === 'gpt-image-1') {
    // gpt-image-1 supports a real alpha channel via background: 'transparent'
    return { model, prompt, size: '1024x1024', n: 1, quality: 'low', background: 'transparent' }
  }
  if (model === 'dall-e-3') {
    return { model, prompt, size: '1024x1024', n: 1 }
  }
  // dall-e-2 — small is plenty for a downscaled prop
  return { model, prompt, size: '256x256', n: 1 }
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

// Snaps alpha to 0 or 255 around a threshold so the sprite is solid with clean
// edges instead of a blurry semi-transparent halo.
function cleanAlpha(data, threshold = ALPHA_THRESHOLD) {
  for (let i = 0; i < data.length; i += 4) {
    data[i + 3] = data[i + 3] >= threshold ? 255 : 0
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

// Downscales an image to pxW×pxH RGBA, preserving + cleaning alpha. If `keyOut`
// is true, applies corner chroma-keying first (for models that return opaque
// images), so the threshold cleanup then removes the keyed-out halo.
function downscaleToAsset(src, pxW, pxH, crossOrigin, keyOut) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    if (crossOrigin) img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = stepDownToCanvas(img, pxW, pxH)
      const ctx = canvas.getContext('2d')
      try {
        const id = ctx.getImageData(0, 0, pxW, pxH)
        if (keyOut) chromaKey(id.data, pxW, pxH)
        cleanAlpha(id.data)
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

  const res = await fetch(`${API_BASE}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(buildBody(model, STYLE_PREFIX_ASSET + prompt.trim())),
  })

  if (!res.ok) {
    let msg = `OpenAI request failed (HTTP ${res.status}).`
    try {
      const err = await res.json()
      if (err?.error?.message) msg = err.error.message
    } catch { /* ignore parse error */ }
    throw new Error(msg)
  }

  const json = await res.json()
  const item = json?.data?.[0]
  if (!item) throw new Error('No image returned by the API.')

  // gpt-image-1 returns alpha already; dall-e returns opaque → chroma-key it.
  const keyOut = model !== 'gpt-image-1'

  if (item.b64_json) {
    return downscaleToAsset(`data:image/png;base64,${item.b64_json}`, pxW, pxH, false, keyOut)
  }
  if (item.url) {
    return downscaleToAsset(item.url, pxW, pxH, true, keyOut)
  }
  throw new Error('No image data in the API response.')
}

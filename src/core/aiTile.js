// AI base-tile generation via the OpenAI Images API.
// In dev, requests go through the Vite proxy (/openai) to avoid CORS.
const API_BASE = import.meta.env.DEV ? '/openai/v1' : 'https://api.openai.com/v1'

const STYLE_PREFIX =
  'Pixel art video-game terrain tile texture, top-down view, seamless tileable, ' +
  'flat shading, simple, no border, no text, fills the entire square frame. Subject: '

// OpenAI retired dall-e-2/dall-e-3; the available image models are the
// gpt-image family. gpt-image-1 is the proven default.
export const AI_MODELS = [
  { id: 'gpt-image-1',      label: 'gpt-image-1 (stable)' },
  { id: 'gpt-image-1-mini', label: 'gpt-image-1-mini (fast, cheap)' },
  { id: 'gpt-image-1.5',    label: 'gpt-image-1.5' },
  { id: 'gpt-image-2',      label: 'gpt-image-2 (newest)' },
]

function buildBody(model, prompt) {
  // All gpt-image models return b64_json and take size/quality (no response_format).
  return { model, prompt, size: '1024x1024', n: 1, quality: 'low' }
}

// Downscales an image (data URL or remote URL) to tileSize×tileSize RGBA pixels.
function downscaleToTile(src, tileSize, crossOrigin) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    if (crossOrigin) img.crossOrigin = 'anonymous'
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = tileSize
      c.height = tileSize
      const ctx = c.getContext('2d')
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, tileSize, tileSize)
      try {
        const id = ctx.getImageData(0, 0, tileSize, tileSize)
        for (let i = 0; i < id.data.length; i += 4) id.data[i + 3] = 255 // force opaque
        resolve(new Uint8ClampedArray(id.data))
      } catch {
        reject(new Error('Could not read the image (CORS). Try the gpt-image-1 model.'))
      }
    }
    img.onerror = () => reject(new Error('Failed to load the generated image.'))
    img.src = src
  })
}

export async function generateBaseTileWithAI({ prompt, apiKey, model = 'gpt-image-1', tileSize }) {
  if (!apiKey) throw new Error('Missing OpenAI API key.')
  if (!prompt || !prompt.trim()) throw new Error('Enter a prompt describing the tile.')

  const res = await fetch(`${API_BASE}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(buildBody(model, STYLE_PREFIX + prompt.trim())),
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

  if (item.b64_json) {
    return downscaleToTile(`data:image/png;base64,${item.b64_json}`, tileSize, false)
  }
  if (item.url) {
    return downscaleToTile(item.url, tileSize, true)
  }
  throw new Error('No image data in the API response.')
}

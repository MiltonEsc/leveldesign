// AI scenery-prop generation via the OpenAI Images API.
// Props need transparent backgrounds and crisp pixel-art post-processing.
// In dev, requests go through the Vite proxy (/openai) to avoid CORS.

import { AI_MODELS } from './aiTile.js'

export { AI_MODELS }

const API_BASE = import.meta.env.DEV ? '/openai/v1' : 'https://api.openai.com/v1'

const STYLE_BASE = `
Generate a single pixel-art game prop.


Design the object specifically to remain readable at that resolution.

Use large shapes.

Use a limited color palette.

Avoid tiny details.

Avoid sub-pixel features.

Avoid anti-aliasing.

Avoid gradients.

Avoid soft shading.

Transparent background.
`

const BG_TRANSPARENT =
  'Transparent background. No ground, no cast shadow, no text. Subject: '

const BG_SOLID =
  'Plain solid flat magenta (#FF00FF) background filling all empty space. ' +
  'No ground, no cast shadow, no text. Subject: '

const CHROMA_TOLERANCE = 60
const POSTERIZE_LEVELS = 999
const ALPHA_THRESHOLD = 128

function buildBody(model, prompt, transparent, quality = 'low') {
  const body = {
    model,
    prompt,
    size: '1024x1024',
    n: 1,
    quality,
    output_format: 'png',
  }

  if (transparent) {
    body.background = 'transparent'
  }

  return body
}

async function requestImage(apiKey, body) {
  return fetch(`${API_BASE}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })
}

async function readError(res) {
  let msg = `OpenAI request failed (HTTP ${res.status}).`

  try {
    const err = await res.json()
    if (err?.error?.message) msg = err.error.message
  } catch {
    // Ignore parse error.
  }

  return msg
}

function chromaKey(data, w, h, tolerance = CHROMA_TOLERANCE) {
  const corners = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
  ].map(([x, y]) => {
    const i = (y * w + x) * 4
    return [data[i], data[i + 1], data[i + 2]]
  })

  const bg = [0, 1, 2].map(c =>
    Math.round(corners.reduce((sum, pixel) => sum + pixel[c], 0) / corners.length),
  )

  for (let i = 0; i < data.length; i += 4) {
    const dr = data[i] - bg[0]
    const dg = data[i + 1] - bg[1]
    const db = data[i + 2] - bg[2]
    const distance = Math.sqrt(dr * dr + dg * dg + db * db)

    if (distance <= tolerance) {
      data[i + 3] = 0
    }
  }
}

function deFringeMagenta(data) {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue

    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]

    if (r - g > 60 && b - g > 60) {
      data[i + 3] = 0
    }
  }
}

function solidifyAlpha(data, threshold = ALPHA_THRESHOLD) {
  for (let i = 0; i < data.length; i += 4) {
    data[i + 3] = data[i + 3] < threshold ? 0 : 255
  }
}

function posterize(data, levels = POSTERIZE_LEVELS) {
  const step = 255 / (levels - 1)

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue

    data[i] = Math.round(Math.round(data[i] / step) * step)
    data[i + 1] = Math.round(Math.round(data[i + 1] / step) * step)
    data[i + 2] = Math.round(Math.round(data[i + 2] / step) * step)
  }
}

function cropTransparentBounds(canvas) {
  const ctx = canvas.getContext('2d')
  const { width, height } = canvas
  const id = ctx.getImageData(0, 0, width, height)
  const data = id.data

  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3]

      if (alpha > 0) {
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
    }
  }

  if (maxX < minX || maxY < minY) return canvas

  const cropW = maxX - minX + 1
  const cropH = maxY - minY + 1

  const out = document.createElement('canvas')
  out.width = cropW
  out.height = cropH

  const outCtx = out.getContext('2d')
  outCtx.imageSmoothingEnabled = false
  outCtx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH)

  return out
}

function containToTargetCanvas(srcCanvas, pxW, pxH) {
  const out = document.createElement('canvas')
  out.width = pxW
  out.height = pxH

  const ctx = out.getContext('2d')
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, pxW, pxH)

  const scale = Math.min(pxW / srcCanvas.width, pxH / srcCanvas.height)
  const drawW = Math.max(1, Math.floor(srcCanvas.width * scale))
  const drawH = Math.max(1, Math.floor(srcCanvas.height * scale))
  const dx = Math.floor((pxW - drawW) / 2)
  const dy = Math.floor((pxH - drawH) / 2)

  ctx.drawImage(srcCanvas, 0, 0, srcCanvas.width, srcCanvas.height, dx, dy, drawW, drawH)

  return out
}

function imageToCanvas(img) {
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height

  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0)

  return canvas
}

function downscaleCanvasPixelPerfect(srcCanvas, pxW, pxH) {
  const out = document.createElement('canvas')
  out.width = pxW
  out.height = pxH

  const ctx = out.getContext('2d')
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, pxW, pxH)
  ctx.drawImage(srcCanvas, 0, 0, srcCanvas.width, srcCanvas.height, 0, 0, pxW, pxH)

  return out
}

function downscaleToAsset(src, pxW, pxH, crossOrigin, keyOut) {
  return new Promise((resolve, reject) => {
    const img = new Image()

    if (crossOrigin) img.crossOrigin = 'anonymous'

    img.onload = () => {
      try {
        let canvas = imageToCanvas(img)

        if (keyOut) {
          const ctx = canvas.getContext('2d')
          const id = ctx.getImageData(0, 0, canvas.width, canvas.height)
          chromaKey(id.data, canvas.width, canvas.height)
          deFringeMagenta(id.data)
          solidifyAlpha(id.data)
          ctx.putImageData(id, 0, 0)
        }

        canvas = cropTransparentBounds(canvas)
        canvas = containToTargetCanvas(canvas, pxW, pxH)
        canvas = downscaleCanvasPixelPerfect(canvas, pxW, pxH)

        const ctx = canvas.getContext('2d')
        const id = ctx.getImageData(0, 0, pxW, pxH)

        solidifyAlpha(id.data)
        posterize(id.data)

        resolve(new Uint8ClampedArray(id.data))
      } catch {
        reject(new Error('Could not read the image. Try the gpt-image-1 model or check CORS.'))
      }
    }

    img.onerror = () => reject(new Error('Failed to load the generated image.'))
    img.src = src
  })
}

export async function generateAssetWithAI({
  prompt,
  apiKey,
  model = 'gpt-image-1',
  quality = 'low',
  pxW,
  pxH,
}) {
  if (!apiKey) throw new Error('Missing OpenAI API key.')
  if (!prompt || !prompt.trim()) throw new Error('Enter a prompt describing the prop.')
  if (!pxW || !pxH) throw new Error('Missing target pixel size.')

  const subject = prompt.trim()

  let res = await requestImage(
    apiKey,
    buildBody(model, STYLE_BASE + BG_TRANSPARENT + subject, true, quality),
  )

  let keyOut = false

  if (!res.ok) {
    const msg = await readError(res)

    if (/transparent|background/i.test(msg)) {
      res = await requestImage(
        apiKey,
        buildBody(model, STYLE_BASE + BG_SOLID + subject, false, quality),
      )

      keyOut = true

      if (!res.ok) {
        throw new Error(await readError(res))
      }
    } else {
      throw new Error(msg)
    }
  }

  const json = await res.json()
  const item = json?.data?.[0]

  if (!item) throw new Error('No image returned by the API.')

  if (item.b64_json) {
    return downscaleToAsset(
      `data:image/png;base64,${item.b64_json}`,
      pxW,
      pxH,
      false,
      keyOut,
    )
  }

  if (item.url) {
    return downscaleToAsset(item.url, pxW, pxH, true, keyOut)
  }

  throw new Error('No image data in the API response.')
}
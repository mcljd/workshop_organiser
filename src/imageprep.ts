// Shared image preprocessing for the in-browser vision readers.
// Decodes an image, downscales it, and — importantly — trims uniform/black
// "letterbox" borders (phone screenshots, drone-app exports, etc.). Without
// this, border-based background estimation and content bounding boxes break:
// the black bars get read as the background and the whole photo becomes one
// blob. Returns the trimmed pixels plus a trimmed data URL so the 3D floor and
// review overlays line up with what was actually analysed.

export interface Prepped {
  dataUrl: string
  W: number
  H: number
  data: Uint8ClampedArray
}

export async function prepImage(src: string, target = 420): Promise<Prepped> {
  const img = await loadImage(src)
  const scale = Math.min(1, target / Math.max(img.width, img.height))
  const W0 = Math.max(1, Math.round(img.width * scale))
  const H0 = Math.max(1, Math.round(img.height * scale))

  const c = document.createElement('canvas')
  c.width = W0
  c.height = H0
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, W0, H0)
  const full = ctx.getImageData(0, 0, W0, H0).data

  const bright = (x: number, y: number) => {
    const i = (y * W0 + x) * 4
    return (full[i] + full[i + 1] + full[i + 2]) / 3
  }
  const DARK = 16
  const rowDark = (y: number) => {
    let s = 0
    for (let x = 0; x < W0; x++) s += bright(x, y)
    return s / W0 < DARK
  }
  const colDark = (x: number) => {
    let s = 0
    for (let y = 0; y < H0; y++) s += bright(x, y)
    return s / H0 < DARK
  }

  let top = 0
  let bottom = H0 - 1
  let left = 0
  let right = W0 - 1
  while (top < bottom && rowDark(top)) top++
  while (bottom > top && rowDark(bottom)) bottom--
  while (left < right && colDark(left)) left++
  while (right > left && colDark(right)) right--

  const cw = right - left + 1
  const ch = bottom - top + 1
  // No meaningful crop (or a degenerate near-black image) — use as-is.
  if ((left === 0 && top === 0 && cw === W0 && ch === H0) || cw < 16 || ch < 16) {
    return { dataUrl: src, W: W0, H: H0, data: full }
  }

  const c2 = document.createElement('canvas')
  c2.width = cw
  c2.height = ch
  const ctx2 = c2.getContext('2d', { willReadFrequently: true })!
  ctx2.drawImage(c, left, top, cw, ch, 0, 0, cw, ch)
  return {
    dataUrl: c2.toDataURL('image/jpeg', 0.9),
    W: cw,
    H: ch,
    data: ctx2.getImageData(0, 0, cw, ch).data,
  }
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image()
    im.onload = () => resolve(im)
    im.onerror = reject
    im.src = src
  })
}

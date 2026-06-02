// Aerial-view building detector — self-contained computer vision, no API.
// Segments an aerial/satellite image into candidate buildings (sheds/units):
// estimate the dominant background colour, mark everything sufficiently
// different as "structure", clean it up, label the blobs, and keep the large,
// roughly-rectangular ones. Results are deliberately treated as *candidates*
// for a human to confirm/correct — and those corrections tune future scans.

import { prepImage } from './imageprep'

export interface Building {
  id: string
  x: number // normalised 0..1 (top-left)
  y: number
  w: number
  h: number
  score: number // 0..1 confidence
  name: string
  keep: boolean
}

export interface BuildingScan {
  imageDataUrl: string
  aspect: number // width / height of the source image
  buildings: Building[]
}

const FEEDBACK_KEY = 'workshop-organiser:building-feedback'

interface Learned {
  threshold: number // score cutoff for default "keep"
  n: number
}

export function loadLearned(): Learned {
  try {
    const raw = localStorage.getItem(FEEDBACK_KEY)
    if (raw) return JSON.parse(raw) as Learned
  } catch {
    /* ignore */
  }
  return { threshold: 0.5, n: 0 }
}

/**
 * Records the human's keep/discard decisions and nudges the score threshold
 * toward the boundary between what they kept and what they dropped. Honest,
 * lightweight online learning — the next scan's defaults reflect past choices.
 */
export function recordFeedback(buildings: Building[]): void {
  const kept = buildings.filter((b) => b.keep).map((b) => b.score)
  const dropped = buildings.filter((b) => !b.keep).map((b) => b.score)
  if (kept.length === 0 && dropped.length === 0) return
  const minKept = kept.length ? Math.min(...kept) : 0.5
  const maxDropped = dropped.length ? Math.max(...dropped) : 0
  const boundary = Math.min(minKept, Math.max(maxDropped + 0.05, 0.25))
  const prev = loadLearned()
  // Exponential moving average so it adapts but doesn't lurch.
  const threshold = prev.n === 0 ? boundary : prev.threshold * 0.6 + boundary * 0.4
  try {
    localStorage.setItem(
      FEEDBACK_KEY,
      JSON.stringify({ threshold: clamp(threshold, 0.2, 0.85), n: prev.n + 1 }),
    )
  } catch {
    /* ignore */
  }
}

export async function detectBuildings(dataUrl: string): Promise<BuildingScan> {
  const learned = loadLearned()
  // Trim letterbox/black borders first so the border-based background estimate
  // samples the real surroundings (sky/grass/tarmac), not the black bars.
  const prepped = await prepImage(dataUrl, 420)
  const { W, H, data } = prepped

  // Estimate the background as the average colour of the image border.
  let br = 0,
    bg = 0,
    bb = 0,
    bn = 0
  const sampleBorder = (x: number, y: number) => {
    const i = (y * W + x) * 4
    br += data[i]
    bg += data[i + 1]
    bb += data[i + 2]
    bn++
  }
  for (let x = 0; x < W; x++) {
    sampleBorder(x, 0)
    sampleBorder(x, H - 1)
  }
  for (let y = 0; y < H; y++) {
    sampleBorder(0, y)
    sampleBorder(W - 1, y)
  }
  br /= bn
  bg /= bn
  bb /= bn

  // Structure mask: pixels far from the background colour.
  const dist = new Float32Array(W * H)
  let maxD = 1
  for (let i = 0; i < W * H; i++) {
    const dr = data[i * 4] - br
    const dg = data[i * 4 + 1] - bg
    const db = data[i * 4 + 2] - bb
    const d = Math.sqrt(dr * dr + dg * dg + db * db)
    dist[i] = d
    if (d > maxD) maxD = d
  }
  const cut = maxD * 0.28
  let mask: Uint8Array = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) mask[i] = dist[i] > cut ? 1 : 0

  // Open (erode then dilate) to drop speckle and split thin connections.
  mask = erode(mask, W, H)
  mask = erode(mask, W, H)
  mask = dilate(mask, W, H)

  const comps = connectedComponents(mask, W, H)
  const total = W * H
  const buildings: Building[] = []
  let n = 0
  for (const c of comps) {
    const cbw = c.maxX - c.minX + 1
    const cbh = c.maxY - c.minY + 1
    const boxArea = cbw * cbh
    const areaFrac = boxArea / total
    if (areaFrac < 0.004 || areaFrac > 0.5) continue
    if (cbw < 10 || cbh < 10) continue
    const fill = c.area / boxArea // rectangularity
    if (fill < 0.45) continue
    const sizeScore = Math.min(1, areaFrac / 0.06)
    const score = clamp(fill * 0.7 + sizeScore * 0.3, 0, 1)
    n++
    buildings.push({
      id: `b${n}`,
      x: c.minX / W,
      y: c.minY / H,
      w: cbw / W,
      h: cbh / H,
      score,
      name: `Shed ${n}`,
      keep: score >= learned.threshold,
    })
  }

  buildings.sort((a, b) => b.score - a.score)
  return { imageDataUrl: prepped.dataUrl, aspect: W / H, buildings: buildings.slice(0, 16) }
}

interface Comp {
  area: number
  minX: number
  minY: number
  maxX: number
  maxY: number
}

function connectedComponents(mask: Uint8Array, W: number, H: number): Comp[] {
  const seen = new Uint8Array(W * H)
  const comps: Comp[] = []
  const stack: number[] = []
  for (let s = 0; s < W * H; s++) {
    if (!mask[s] || seen[s]) continue
    stack.length = 0
    stack.push(s)
    seen[s] = 1
    const c: Comp = { area: 0, minX: W, minY: H, maxX: 0, maxY: 0 }
    while (stack.length) {
      const i = stack.pop()!
      const x = i % W
      const y = (i / W) | 0
      c.area++
      if (x < c.minX) c.minX = x
      if (x > c.maxX) c.maxX = x
      if (y < c.minY) c.minY = y
      if (y > c.maxY) c.maxY = y
      if (x > 0 && mask[i - 1] && !seen[i - 1]) (seen[i - 1] = 1), stack.push(i - 1)
      if (x < W - 1 && mask[i + 1] && !seen[i + 1]) (seen[i + 1] = 1), stack.push(i + 1)
      if (y > 0 && mask[i - W] && !seen[i - W]) (seen[i - W] = 1), stack.push(i - W)
      if (y < H - 1 && mask[i + W] && !seen[i + W]) (seen[i + W] = 1), stack.push(i + W)
    }
    comps.push(c)
  }
  return comps
}

function erode(m: Uint8Array, W: number, H: number): Uint8Array {
  const out = new Uint8Array(W * H)
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x
      if (
        m[i] &&
        m[i - 1] &&
        m[i + 1] &&
        m[i - W] &&
        m[i + W] &&
        m[i - W - 1] &&
        m[i - W + 1] &&
        m[i + W - 1] &&
        m[i + W + 1]
      )
        out[i] = 1
    }
  return out
}

function dilate(m: Uint8Array, W: number, H: number): Uint8Array {
  const out = new Uint8Array(W * H)
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x
      if (
        m[i] ||
        m[i - 1] ||
        m[i + 1] ||
        m[i - W] ||
        m[i + W]
      )
        out[i] = 1
    }
  return out
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

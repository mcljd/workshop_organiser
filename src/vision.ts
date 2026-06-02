import type { FloorItem, Zone } from './types'
import { newId } from './storage'
import { prepImage } from './imageprep'

// A self-contained floor-plan reader. No API, no model, no network — just
// classical computer vision running on a canvas in the browser:
//   1. Threshold the image into "ink" (walls/lines) vs background (Otsu).
//   2. Find the drawing's bounding box -> the floor outline.
//   3. Detect gaps in the perimeter walls -> doors / openings.
//   4. Erode away thin lines, label what's left -> solid objects (furniture,
//      equipment, anything drawn as a filled block).
// Everything is returned in world coordinates sized to the chosen floor, so
// detected items line up with the floor-plan image on the 3D ground.

export interface Detection {
  floorWidth: number
  floorHeight: number
  zones: Zone[]
  items: FloorItem[]
  summary: { doors: number; objects: number }
  /** The image actually analysed (letterbox borders trimmed). */
  imageDataUrl: string
}

export async function analyzeFloorPlan(dataUrl: string): Promise<Detection> {
  // Trim any black/uniform borders first, then analyse the real content.
  const prepped = await prepImage(dataUrl, 360)
  const { W, H, data } = prepped

  // Grayscale + Otsu threshold -> ink mask (1 = wall/line).
  const gray = new Uint8Array(W * H)
  const hist = new Array(256).fill(0)
  for (let i = 0; i < W * H; i++) {
    const r = data[i * 4]
    const g = data[i * 4 + 1]
    const b = data[i * 4 + 2]
    const v = (r * 299 + g * 587 + b * 114) / 1000
    gray[i] = v
    hist[v | 0]++
  }
  const thr = otsu(hist, W * H)
  let ink = new Uint8Array(W * H)
  let inkCount = 0
  for (let i = 0; i < W * H; i++) {
    if (gray[i] < thr) {
      ink[i] = 1
      inkCount++
    }
  }
  // Inverted plan (dark background): flip so walls are the minority "ink".
  if (inkCount > W * H * 0.5) {
    for (let i = 0; i < W * H; i++) ink[i] = ink[i] ? 0 : 1
  }

  // Content bounding box.
  let minX = W,
    minY = H,
    maxX = 0,
    maxY = 0
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (ink[y * W + x]) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX <= minX || maxY <= minY) {
    return {
      floorWidth: 1200,
      floorHeight: 800,
      zones: [],
      items: [],
      summary: { doors: 0, objects: 0 },
      imageDataUrl: prepped.dataUrl,
    }
  }

  const bw = maxX - minX
  const bh = maxY - minY
  const FW = 1200
  const FH = Math.round((FW * bh) / bw)
  const toWX = (px: number) => ((px - minX) / bw) * FW
  const toWY = (py: number) => ((py - minY) / bh) * FH
  const sx = FW / bw
  const sy = FH / bh

  const items: FloorItem[] = []

  // --- Doors: gaps in the perimeter walls. ---
  const doors = detectDoors(ink, W, minX, minY, maxX, maxY)
  for (const d of doors) {
    items.push({
      id: newId(),
      name: 'Door',
      x: toWX(d.cx),
      y: toWY(d.cy),
      width: Math.max(40, d.len * (d.horizontal ? sx : sy)),
      height: 16,
      rotation: d.horizontal ? 0 : 90,
      status: 'ready',
      shape: 'door',
    })
  }

  // --- Objects: erode thin lines away, label the solid blobs that remain. ---
  const eroded = erode(ink, W, H)
  const comps = connectedComponents(eroded, W, H)
  const planArea = bw * bh
  let objN = 0
  for (const c of comps) {
    const area = c.area
    const cbw = c.maxX - c.minX + 1
    const cbh = c.maxY - c.minY + 1
    // Skip noise and anything spanning most of the plan (that's the structure).
    if (area < 14) continue
    if (cbw * cbh > planArea * 0.4) continue
    if (cbw < 3 && cbh < 3) continue
    objN++
    items.push({
      id: newId(),
      name: `Object ${objN}`,
      x: toWX((c.minX + c.maxX) / 2),
      y: toWY((c.minY + c.maxY) / 2),
      width: Math.max(36, cbw * sx),
      height: Math.max(36, cbh * sy),
      rotation: 0,
      status: 'incoming',
      shape: 'box',
    })
    if (objN >= 24) break
  }

  return {
    floorWidth: FW,
    floorHeight: FH,
    zones: [],
    items,
    summary: { doors: doors.length, objects: objN },
    imageDataUrl: prepped.dataUrl,
  }
}

interface Door {
  cx: number
  cy: number
  len: number
  horizontal: boolean
}

/**
 * Walks each side of the perimeter. A wall should be a near-continuous run of
 * ink along the edge; a plausible-length break flanked by wall on both sides
 * is a door / opening.
 */
function detectDoors(
  ink: Uint8Array,
  W: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): Door[] {
  const doors: Door[] = []
  const band = 3
  const bw = maxX - minX
  const bh = maxY - minY

  const present = (along: number, edge: 'top' | 'bottom' | 'left' | 'right') => {
    for (let t = 0; t <= band; t++) {
      if (edge === 'top' && ink[(minY + t) * W + along]) return true
      if (edge === 'bottom' && ink[(maxY - t) * W + along]) return true
      if (edge === 'left' && ink[along * W + (minX + t)]) return true
      if (edge === 'right' && ink[along * W + (maxX - t)]) return true
    }
    return false
  }

  const scanEdge = (
    edge: 'top' | 'bottom' | 'left' | 'right',
    from: number,
    to: number,
    L: number,
  ) => {
    const minGap = Math.max(3, L * 0.03)
    const maxGap = L * 0.22
    let runStart = -1
    let sawWallBefore = false
    for (let a = from; a <= to; a++) {
      const wall = present(a, edge)
      if (wall) {
        if (runStart >= 0) {
          const gapLen = a - runStart
          if (sawWallBefore && gapLen >= minGap && gapLen <= maxGap) {
            const mid = (runStart + a) / 2
            const horizontal = edge === 'top' || edge === 'bottom'
            doors.push({
              cx: horizontal ? mid : edge === 'left' ? minX : maxX,
              cy: horizontal ? (edge === 'top' ? minY : maxY) : mid,
              len: gapLen,
              horizontal,
            })
          }
          runStart = -1
        }
        sawWallBefore = true
      } else if (runStart < 0) {
        runStart = a
      }
    }
  }

  scanEdge('top', minX, maxX, bw)
  scanEdge('bottom', minX, maxX, bw)
  scanEdge('left', minY, maxY, bh)
  scanEdge('right', minY, maxY, bh)
  return doors
}

/** 3x3 min-filter (erosion): drops thin lines, keeps filled blobs. */
function erode(ink: Uint8Array, W: number, H: number): Uint8Array {
  const out = new Uint8Array(W * H)
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x
      if (
        ink[i] &&
        ink[i - 1] &&
        ink[i + 1] &&
        ink[i - W] &&
        ink[i + W] &&
        ink[i - W - 1] &&
        ink[i - W + 1] &&
        ink[i + W - 1] &&
        ink[i + W + 1]
      ) {
        out[i] = 1
      }
    }
  }
  return out
}

interface Comp {
  area: number
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** 4-connected component labelling via an iterative flood fill. */
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

function otsu(hist: number[], total: number): number {
  let sum = 0
  for (let t = 0; t < 256; t++) sum += t * hist[t]
  let sumB = 0
  let wB = 0
  let max = 0
  let threshold = 128
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (wB === 0) continue
    const wF = total - wB
    if (wF === 0) break
    sumB += t * hist[t]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) * (mB - mF)
    if (between > max) {
      max = between
      threshold = t
    }
  }
  return threshold
}

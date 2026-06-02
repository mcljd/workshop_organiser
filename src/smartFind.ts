import type { ItemShape } from './types'

// Zero-shot object detection in the browser via Transformers.js (OWL-ViT).
// Unlike the fixed-class COCO model, the user types *what to look for* —
// "trailer", "forklift", "shipping container", "ladder" — and the model finds
// it. Runs fully on-device (WASM/WebGPU); the model downloads once, no key.

export interface FoundObject {
  label: string
  shape: ItemShape
  cx: number
  cy: number
  w: number
  h: number
  score: number
}

export interface SmartScan {
  aspect: number
  objects: FoundObject[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let detectorP: Promise<any> | null = null

async function getDetector() {
  if (!detectorP) {
    detectorP = (async () => {
      const { pipeline } = await import('@huggingface/transformers')
      return pipeline('zero-shot-object-detection', 'Xenova/owlvit-base-patch32')
    })()
  }
  return detectorP
}

function shapeFor(label: string): ItemShape {
  const l = label.toLowerCase()
  if (l.includes('boat') || l.includes('yacht') || l.includes('vessel')) return 'boat'
  if (l.includes('door')) return 'door'
  return 'box'
}

export async function smartFind(dataUrl: string, labels: string[]): Promise<SmartScan> {
  const dims = await imageDims(dataUrl)
  const detector = await getDetector()
  // OWL-ViT expects candidate labels phrased as "a photo of a X".
  const candidates = labels.map((l) => l.trim()).filter(Boolean)
  const raw = await detector(dataUrl, candidates, { threshold: 0.1, topk: 40 })
  const objects: FoundObject[] = []
  for (const r of raw) {
    const b = r.box as { xmin: number; ymin: number; xmax: number; ymax: number }
    const w = (b.xmax - b.xmin) / dims.w
    const h = (b.ymax - b.ymin) / dims.h
    if (w <= 0 || h <= 0) continue
    objects.push({
      label: r.label,
      shape: shapeFor(r.label),
      cx: (b.xmin + b.xmax) / 2 / dims.w,
      cy: (b.ymin + b.ymax) / 2 / dims.h,
      w,
      h,
      score: r.score,
    })
  }
  return { aspect: dims.w / dims.h, objects }
}

function imageDims(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const im = new Image()
    im.onload = () => resolve({ w: im.naturalWidth, h: im.naturalHeight })
    im.onerror = reject
    im.src = src
  })
}

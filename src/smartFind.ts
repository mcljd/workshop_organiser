import type { ItemShape } from './types'
import { prepImage } from './imageprep'

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
  /** The image actually analysed (letterbox borders trimmed). */
  imageDataUrl: string
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
  // Trim letterbox borders so detections (and the floor image) line up.
  const prepped = await prepImage(dataUrl, 768)
  const detector = await getDetector()
  const candidates = labels.map((l) => l.trim()).filter(Boolean)
  const raw = await detector(prepped.dataUrl, candidates, { threshold: 0.1, topk: 40 })
  const objects: FoundObject[] = []
  for (const r of raw) {
    const b = r.box as { xmin: number; ymin: number; xmax: number; ymax: number }
    const w = (b.xmax - b.xmin) / prepped.W
    const h = (b.ymax - b.ymin) / prepped.H
    if (w <= 0 || h <= 0) continue
    objects.push({
      label: r.label,
      shape: shapeFor(r.label),
      cx: (b.xmin + b.xmax) / 2 / prepped.W,
      cy: (b.ymin + b.ymax) / 2 / prepped.H,
      w,
      h,
      score: r.score,
    })
  }
  return { aspect: prepped.W / prepped.H, objects, imageDataUrl: prepped.dataUrl }
}

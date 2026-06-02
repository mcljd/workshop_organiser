import type { ItemShape } from './types'

// An actual neural network running in the browser: TensorFlow.js + COCO-SSD.
// It names objects in a photo (boats, vehicles, etc.). Loaded lazily and
// cached — the heavy library and weights only download the first time the
// user asks for it, so the rest of the app stays fast.

export interface DetectedObject {
  name: string
  shape: ItemShape
  cx: number // normalised centre 0..1
  cy: number
  w: number // normalised size 0..1
  h: number
  score: number
}

export interface ObjectScan {
  aspect: number
  objects: DetectedObject[]
}

// COCO classes we care about for a yard/workshop, mapped to our shapes.
const CLASS_MAP: Record<string, { shape: ItemShape; label: string }> = {
  boat: { shape: 'boat', label: 'Boat' },
  car: { shape: 'box', label: 'Car' },
  truck: { shape: 'box', label: 'Truck' },
  bus: { shape: 'box', label: 'Bus' },
  motorcycle: { shape: 'box', label: 'Motorbike' },
  bicycle: { shape: 'box', label: 'Bike' },
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let modelPromise: Promise<any> | null = null

async function getModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      const tf = await import('@tensorflow/tfjs')
      await tf.ready()
      const cocoSsd = await import('@tensorflow-models/coco-ssd')
      // Full mobilenet_v2 base — more accurate than the lite variant.
      return cocoSsd.load({ base: 'mobilenet_v2' })
    })()
  }
  return modelPromise
}

export async function detectObjectsInPhoto(dataUrl: string): Promise<ObjectScan> {
  const img = await loadImage(dataUrl)
  const model = await getModel()
  const preds = await model.detect(img, 40)
  const objects: DetectedObject[] = []
  for (const p of preds) {
    const map = CLASS_MAP[p.class]
    if (!map || p.score < 0.4) continue
    const [bx, by, bw, bh] = p.bbox as [number, number, number, number]
    objects.push({
      name: map.label,
      shape: map.shape,
      cx: (bx + bw / 2) / img.width,
      cy: (by + bh / 2) / img.height,
      w: bw / img.width,
      h: bh / img.height,
      score: p.score,
    })
  }
  return { aspect: img.width / img.height, objects }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image()
    im.onload = () => resolve(im)
    im.onerror = reject
    im.src = src
  })
}

import { prepImage } from './imageprep'

// Reads text labels off a floor plan / photo with Tesseract (free, open, fully
// in-browser — engine + language data download once). Turns labels like
// "PONTOON BOAT 24'x8'" into named, positioned, roughly-sized items, so the
// drawing names the items for you. Lazy-loaded so it never affects load time.

export interface OcrLabel {
  text: string
  cx: number // normalised centre 0..1
  cy: number
  lengthFt?: number
  widthFt?: number
  isBoat: boolean
}

export interface OcrResult {
  aspect: number
  imageDataUrl: string
  labels: OcrLabel[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let workerP: Promise<any> | null = null
async function getWorker() {
  if (!workerP) {
    workerP = (async () => {
      const { createWorker } = await import('tesseract.js')
      return createWorker('eng')
    })()
  }
  return workerP
}

// Architectural/fixture words that aren't movable items.
const IGNORE = new Set([
  'window', 'windows', 'door', 'doors', 'overhead', 'coil', 'studwalls', 'porch',
  'eyebrow', 'outlets', 'outlet', 'hose', 'bib', 'mop', 'sink', 'linen', 'ref',
  'floor', 'drains', 'drain', 'mech', 'bath', 'mud', 'room', 'showers', 'shower',
  'pantry', 'gardeners', 'the', 'and', 'with',
])
const BOAT_RE = /boat|jet ?ski|kayak|rib|yacht|dinghy|canoe|vessel|pontoon|trailer/i
const DIM_RE = /(\d+(?:\.\d+)?)\s*['’`ft]*\s*[xX×]\s*(\d+(?:\.\d+)?)/

export async function readLabels(dataUrl: string): Promise<OcrResult> {
  const prepped = await prepImage(dataUrl, 1100) // OCR likes higher resolution
  const worker = await getWorker()
  const { data } = await worker.recognize(prepped.dataUrl)
  const lines = extractLines(data)

  const labels: OcrLabel[] = []
  for (const ln of lines) {
    if ((ln.confidence ?? 100) < 50) continue
    const raw = String(ln.text || '').replace(/\s+/g, ' ').trim()
    if (!raw) continue

    const dim = raw.match(DIM_RE)
    const lengthFt = dim ? parseFloat(dim[1]) : undefined
    const widthFt = dim ? parseFloat(dim[2]) : undefined

    const cleaned = raw.replace(DIM_RE, '').replace(/[~|_]+/g, ' ')
    const words = cleaned.split(/\s+/).filter((w) => /[a-z]/i.test(w))
    const meaningful = words.filter(
      (w) => w.replace(/[^a-z]/gi, '').length >= 3 && !IGNORE.has(w.toLowerCase().replace(/[^a-z]/g, '')),
    )
    if (meaningful.length === 0) continue
    const name = titleCase(meaningful.join(' '))
    if (name.length < 3 || name.length > 28) continue

    const b = ln.bbox
    if (!b) continue
    labels.push({
      text: name,
      cx: (b.x0 + b.x1) / 2 / prepped.W,
      cy: (b.y0 + b.y1) / 2 / prepped.H,
      lengthFt,
      widthFt,
      isBoat: BOAT_RE.test(raw),
    })
  }

  return { aspect: prepped.W / prepped.H, imageDataUrl: prepped.dataUrl, labels: labels.slice(0, 30) }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractLines(data: any): any[] {
  const out: any[] = [] // eslint-disable-line @typescript-eslint/no-explicit-any
  if (Array.isArray(data?.lines)) return data.lines
  if (Array.isArray(data?.blocks)) {
    for (const blk of data.blocks)
      for (const par of blk.paragraphs || [])
        for (const ln of par.lines || []) out.push(ln)
    if (out.length) return out
  }
  if (Array.isArray(data?.words)) return data.words
  return out
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

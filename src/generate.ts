import type { FloorItem, ItemStatus, WorkshopState, Zone } from './types'
import { newId } from './storage'
import { seedItemDates } from './manager'

export type SpaceType = 'boatyard' | 'garage' | 'warehouse' | 'other'
export type SpaceSize = 'small' | 'medium' | 'large'

export interface WizardAnswers {
  name: string
  type: SpaceType
  size: SpaceSize
  count: number
  noun: string
  floorImage: string | null
}

const SIZE_DIMS: Record<SpaceSize, { w: number; h: number }> = {
  small: { w: 800, h: 560 },
  medium: { w: 1200, h: 800 },
  large: { w: 1600, h: 1040 },
}

const TYPE_DEFAULTS: Record<SpaceType, { noun: string; isBoat: boolean }> = {
  boatyard: { noun: 'Boat', isBoat: true },
  garage: { noun: 'Vehicle', isBoat: false },
  warehouse: { noun: 'Pallet', isBoat: false },
  other: { noun: 'Item', isBoat: false },
}

const STATUS_CYCLE: ItemStatus[] = ['incoming', 'in_progress', 'in_progress', 'ready', 'blocked']

/**
 * Turns the onboarding answers (and optional uploaded floor plan) into a
 * ready-to-use 3D workshop: a few sensible zones plus the requested number of
 * items, neatly laid out in the working area. This stands in for the future
 * "AI reads your floor plan & photos" step — same output shape, so swapping in
 * a real vision model later changes nothing downstream.
 */
export function generateWorkshop(a: WizardAnswers): WorkshopState {
  const { w, h } = SIZE_DIMS[a.size]
  const defaults = TYPE_DEFAULTS[a.type]
  const noun = a.noun.trim() || defaults.noun
  const isBoat = a.type === 'boatyard'

  // Bands: intake (top), working area (middle), ready/dispatch (bottom),
  // with an aisle separating intake from the working area.
  const aisleY = h * 0.2
  const zones: Zone[] = [
    z('Intake', 0, 0, w, h * 0.16, '#0ea5e9'),
    z('Main Aisle', 0, aisleY, w, h * 0.1, '#94a3b8', { isAisle: true }),
    z('Working Area', w * 0.04, h * 0.34, w * 0.92, h * 0.4, '#6366f1'),
    z('Ready / Dispatch', 0, h * 0.82, w, h * 0.18, '#22c55e', { isExit: true }),
  ]

  const items = layoutItems(a.count, noun, isBoat, w, h)
  seedItemDates(items)

  return {
    version: 2,
    name: a.name.trim() || 'My Workshop',
    floor: { imageDataUrl: a.floorImage, width: w, height: h },
    zones,
    items,
  }
}

/**
 * Lays out `count` movable items (boats/vehicles/pallets) in a tidy grid
 * across the lower working area of a floor of the given dimensions. Reused
 * both by the template generator and after a floor plan is read from an image.
 */
export function layoutItems(
  count: number,
  noun: string,
  isBoat: boolean,
  w: number,
  h: number,
): FloorItem[] {
  const n = Math.max(1, Math.min(40, Math.round(count) || 6))
  const area = { x: w * 0.06, y: h * 0.5, w: w * 0.88, h: h * 0.42 }
  const cols = Math.ceil(Math.sqrt(n * (area.w / area.h)))
  const rows = Math.ceil(n / cols)
  const cellW = area.w / cols
  const cellH = area.h / rows
  const itemW = Math.min(cellW * 0.72, isBoat ? 220 : 150)
  const itemH = Math.min(cellH * 0.6, isBoat ? 80 : 90)

  const items: FloorItem[] = []
  for (let i = 0; i < n; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    items.push({
      id: newId(),
      name: `${noun} ${i + 1}`,
      x: area.x + cellW * (col + 0.5),
      y: area.y + cellH * (row + 0.5),
      width: itemW,
      height: itemH,
      rotation: 0,
      status: STATUS_CYCLE[i % STATUS_CYCLE.length],
      shape: isBoat ? 'boat' : 'box',
    })
  }
  return items
}

function z(
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  extra: Partial<Zone> = {},
): Zone {
  return { id: newId(), name, x, y, width, height, color, ...extra }
}

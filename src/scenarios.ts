import type { FloorItem, WorkshopState, Zone } from './types'

// Pre-built demo layouts so the app is instantly useful and tells the story
// without any setup. Coordinates are in world units on the floor (x right,
// y "down" in the top-down sense / depth in 3D).

let seq = 0
const id = () => `seed-${seq++}`

function boat(
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: FloorItem['rotation'],
  status: FloorItem['status'],
  notes?: string,
): FloorItem {
  return { id: id(), name, x, y, width, height, rotation, status, shape: 'boat', notes }
}

function box(
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: FloorItem['rotation'],
  status: FloorItem['status'],
  notes?: string,
): FloorItem {
  return { id: id(), name, x, y, width, height, rotation, status, shape: 'box', notes }
}

function zone(
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  extra: Partial<Zone> = {},
): Zone {
  return { id: id(), name, x, y, width, height, color, ...extra }
}

// ---- Redbay-style boatyard -------------------------------------------------
const boatyard: WorkshopState = {
  version: 2,
  name: 'Redbay Boatyard',
  floor: { imageDataUrl: null, width: 1200, height: 800 },
  zones: [
    zone('Slipway / Launch', 0, 0, 150, 800, '#0ea5e9', { isExit: true }),
    zone('Main Aisle', 150, 360, 1050, 90, '#94a3b8', { isAisle: true }),
    zone('Dry Dock', 190, 40, 380, 300, '#6366f1'),
    zone('Paint Bay', 190, 470, 380, 290, '#a855f7'),
    zone('Fit-out Bay', 610, 40, 320, 300, '#14b8a6'),
    zone('Engine Shop', 610, 470, 320, 290, '#f97316'),
    zone('Storage Yard', 970, 40, 210, 720, '#64748b'),
  ],
  items: [
    boat('Aurora', 380, 180, 240, 90, 0, 'in_progress', 'Hull repair — gelcoat resealing. Due Fri.'),
    boat('Sea Breeze', 360, 600, 230, 85, 0, 'in_progress', 'Antifoul + topside respray.'),
    boat('Kingfisher', 770, 180, 210, 80, 0, 'ready', 'Fit-out complete. Awaiting collection.'),
    boat('Otter', 770, 600, 200, 78, 0, 'blocked', 'Waiting on replacement outdrive — ETA Wed.'),
    boat('Marlin', 75, 250, 170, 64, 90, 'ready', 'Launching today.'),
    boat('Nomad', 1075, 150, 180, 70, 90, 'incoming', 'Just arrived. Survey pending.'),
    boat('Tempest', 1075, 360, 180, 70, 90, 'incoming', 'Winter storage.'),
    boat('Saffron', 1075, 560, 180, 70, 90, 'incoming', 'Winter storage.'),
  ],
}

// ---- Car service garage ----------------------------------------------------
const garage: WorkshopState = {
  version: 2,
  name: 'City Auto Garage',
  floor: { imageDataUrl: null, width: 1000, height: 700 },
  zones: [
    zone('Forecourt / Out', 0, 0, 1000, 110, '#0ea5e9', { isExit: true }),
    zone('Drive Aisle', 0, 300, 1000, 100, '#94a3b8', { isAisle: true }),
    zone('Bay 1', 60, 140, 180, 150, '#6366f1'),
    zone('Bay 2', 270, 140, 180, 150, '#6366f1'),
    zone('MOT Bay', 480, 140, 200, 150, '#14b8a6'),
    zone('Tyre Bay', 710, 140, 220, 150, '#f97316'),
    zone('Waiting Park', 60, 420, 880, 230, '#64748b'),
  ],
  items: [
    box('Focus — AB12', 150, 210, 150, 75, 0, 'in_progress', 'Brake pads + discs.'),
    box('Golf — CD34', 360, 210, 150, 75, 0, 'in_progress', 'Cambelt service.'),
    box('Civic — EF56', 580, 210, 150, 75, 0, 'ready', 'MOT passed.'),
    box('Astra — GH78', 820, 210, 150, 75, 0, 'blocked', 'Awaiting alternator.'),
    box('Polo — IJ90', 180, 520, 150, 75, 0, 'incoming', 'Booked 14:00.'),
    box('Mini — KL12', 380, 520, 150, 75, 0, 'incoming', 'Booked 14:30.'),
  ],
}

// ---- Distribution warehouse ------------------------------------------------
const warehouse: WorkshopState = {
  version: 2,
  name: 'Distribution Warehouse',
  floor: { imageDataUrl: null, width: 1100, height: 760 },
  zones: [
    zone('Receiving', 0, 0, 1100, 120, '#0ea5e9'),
    zone('Cross Aisle', 0, 330, 1100, 90, '#94a3b8', { isAisle: true }),
    zone('Rack A', 60, 150, 460, 160, '#6366f1'),
    zone('Rack B', 580, 150, 460, 160, '#6366f1'),
    zone('Packing', 60, 440, 640, 280, '#14b8a6'),
    zone('Dispatch', 740, 440, 300, 280, '#22c55e', { isExit: true }),
  ],
  items: [
    box('Pallet 1042', 160, 220, 120, 90, 0, 'in_progress', 'Picking in progress.'),
    box('Pallet 1043', 320, 220, 120, 90, 0, 'incoming', 'Received 09:10.'),
    box('Pallet 1044', 680, 220, 120, 90, 0, 'incoming', 'Putaway pending.'),
    box('Order #5521', 300, 560, 140, 100, 0, 'ready', 'Packed — ready to ship.'),
    box('Order #5522', 500, 560, 140, 100, 0, 'in_progress', 'Packing.'),
    box('Order #5519', 860, 560, 140, 100, 0, 'blocked', 'Missing line item.'),
  ],
}

export interface Scenario {
  key: string
  label: string
  build: () => WorkshopState
}

// Deep-clone on build so each load is a fresh, independently-editable copy.
const clone = (s: WorkshopState) => (): WorkshopState =>
  JSON.parse(JSON.stringify(s)) as WorkshopState

export const SCENARIOS: Scenario[] = [
  { key: 'boatyard', label: 'Boatyard', build: clone(boatyard) },
  { key: 'garage', label: 'Car Garage', build: clone(garage) },
  { key: 'warehouse', label: 'Warehouse', build: clone(warehouse) },
]

export function defaultScenario(): WorkshopState {
  return SCENARIOS[0].build()
}

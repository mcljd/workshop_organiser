import type { FloorItem, WorkshopState, Zone } from './types'
import { seedItemDates } from './manager'

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

// ---- Redbay HQ (main building, from the real floor plan) -------------------
const redbayHQ: WorkshopState = {
  version: 2,
  name: 'Redbay Boats — HQ',
  floor: { imageDataUrl: null, width: 1200, height: 1024 },
  zones: [
    zone('Design Office', 20, 20, 180, 120, '#94a3b8'),
    zone('Conor Office', 210, 20, 120, 120, '#94a3b8'),
    zone('Main Office', 340, 20, 230, 120, '#94a3b8'),
    zone('Customer Suite', 640, 20, 230, 120, '#0ea5e9'),
    zone('Toilets', 880, 20, 110, 120, '#94a3b8'),
    zone('Steve Kitchen', 1000, 20, 180, 190, '#94a3b8'),
    zone('Main Workshop', 20, 360, 470, 640, '#6366f1'),
    zone('Tubers Bench', 430, 300, 80, 210, '#a855f7'),
    zone('Show Room', 520, 220, 420, 300, '#14b8a6'),
    zone('Welding Workshop', 950, 360, 230, 210, '#f97316'),
    zone('Storage', 780, 540, 170, 150, '#a855f7'),
    zone('Heater', 430, 720, 110, 90, '#94a3b8'),
    zone('Sheet wood & pallet storage', 560, 780, 330, 70, '#a855f7'),
    zone('Compressor', 330, 870, 110, 90, '#94a3b8'),
    zone('Engine Store', 520, 870, 360, 130, '#64748b'),
    zone('Despatch', 20, 20, 1, 1, '#22c55e', { isExit: true }),
  ],
  items: [
    boat('Stormforce 11 (display)', 730, 360, 280, 90, 0, 'ready', 'Showroom demo boat.'),
    boat('Cygnus GRP hull', 250, 520, 240, 85, 0, 'in_progress', 'Lay-up in progress.'),
    boat('Hull 214', 1060, 460, 200, 78, 90, 'in_progress', 'Welding the A-frame.'),
    box('Suzuki DF250', 700, 935, 120, 80, 0, 'incoming', 'Awaiting fit.'),
    box('Resin pallet', 700, 815, 130, 50, 0, 'incoming'),
    box('Build trailer', 250, 760, 200, 70, 0, 'incoming', 'Spare build trailer.'),
  ],
}

// ---- Redbay Stores & Tubing (second building, from the floor plan) ---------
const redbayStores: WorkshopState = {
  version: 2,
  name: 'Redbay Boats — Stores & Tubing',
  floor: { imageDataUrl: null, width: 1200, height: 976 },
  zones: [
    zone('Fibreglass tools', 20, 20, 70, 300, '#a855f7'),
    zone('Main Store', 110, 20, 420, 120, '#6366f1'),
    zone('Shop', 560, 20, 250, 120, '#14b8a6'),
    zone('Tea Room', 840, 20, 340, 120, '#0ea5e9'),
    zone('Printer Room', 980, 150, 200, 80, '#94a3b8'),
    zone('Props + engine spares', 980, 240, 200, 70, '#a855f7'),
    zone('Files', 1110, 320, 70, 170, '#94a3b8'),
    zone('S/S and Brass', 40, 170, 130, 70, '#a855f7'),
    zone('Fabric', 380, 180, 120, 120, '#f97316'),
    zone('Lexan', 380, 320, 120, 120, '#f97316'),
    zone('Wire', 600, 170, 80, 60, '#a855f7'),
    zone('Hoses', 690, 170, 90, 60, '#a855f7'),
    zone('Sheet wood & pallet storage', 430, 560, 330, 60, '#a855f7'),
    zone('Tubing Workshop', 430, 640, 730, 320, '#f59e0b'),
    zone('Loading door', 60, 150, 1, 1, '#22c55e', { isExit: true }),
  ],
  items: [
    boat('RIB tube set', 760, 800, 260, 90, 0, 'in_progress', 'Tubing fit-out.'),
    box('Fabric roll', 440, 240, 90, 70, 0, 'incoming'),
    box('Lexan sheet', 440, 380, 90, 70, 0, 'incoming'),
    box('Engine spares', 1075, 275, 90, 50, 0, 'in_progress'),
    box('S/S stock', 100, 205, 90, 50, 0, 'ready'),
    box('Pallet — ply', 600, 590, 120, 45, 0, 'incoming'),
  ],
}

// ---- Redbay whole site: both buildings side by side + outdoor yard ---------
const DX = 1240 // horizontal offset for the second building
const redbayWhole: WorkshopState = {
  version: 2,
  name: 'Redbay Boats — Whole Site',
  floor: { imageDataUrl: null, width: 2480, height: 1320 },
  zones: [
    ...redbayHQ.zones
      .filter((z) => !z.isExit)
      .map((z) => ({ ...z, id: id() })),
    ...redbayStores.zones
      .filter((z) => !z.isExit)
      .map((z) => ({ ...z, id: id(), x: z.x + DX })),
    zone('Yard / Hardstand', 40, 1070, 2400, 230, '#64748b', { isExit: true }),
  ],
  items: [
    ...redbayHQ.items.map((i) => ({ ...i, id: id() })),
    ...redbayStores.items.map((i) => ({ ...i, id: id(), x: i.x + DX })),
    boat('Lifeboat hull', 220, 1185, 270, 95, 0, 'ready', 'On the hardstand, ready for collection.'),
    boat('RIB — yard 1', 580, 1185, 200, 78, 0, 'incoming', 'Just arrived for service.'),
    boat('RIB — yard 2', 840, 1185, 200, 78, 0, 'incoming'),
    boat('Pontoon', 1140, 1185, 270, 95, 0, 'in_progress'),
    boat('Customer RIB', 1520, 1185, 200, 78, 0, 'ready', 'Awaiting customer pickup.'),
    box('Trailer stack', 1880, 1185, 160, 90, 0, 'incoming'),
  ],
}

export interface Scenario {
  key: string
  label: string
  build: () => WorkshopState
}

// Deep-clone on build so each load is a fresh, independently-editable copy,
// with realistic arrival/due dates seeded for the manager view.
const clone = (s: WorkshopState) => (): WorkshopState => {
  const copy = JSON.parse(JSON.stringify(s)) as WorkshopState
  seedItemDates(copy.items)
  return copy
}

export const SCENARIOS: Scenario[] = [
  { key: 'boatyard', label: 'Boatyard', build: clone(boatyard) },
  { key: 'redbay-hq', label: 'Redbay HQ', build: clone(redbayHQ) },
  { key: 'redbay-stores', label: 'Redbay Stores', build: clone(redbayStores) },
  { key: 'redbay-whole', label: 'Redbay Whole Site', build: clone(redbayWhole) },
  { key: 'garage', label: 'Car Garage', build: clone(garage) },
  { key: 'warehouse', label: 'Warehouse', build: clone(warehouse) },
]

export function defaultScenario(): WorkshopState {
  return SCENARIOS[0].build()
}

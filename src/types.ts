// Core data model for the workshop organiser.
// Everything a workshop layout needs is captured here so it can be
// saved, reloaded, exported, and (later) fed to the AI / live-tracking layers.

export type ItemStatus = 'incoming' | 'in_progress' | 'ready' | 'blocked'

export type ItemShape = 'boat' | 'box' | 'door'

export interface FloorItem {
  id: string
  /** Human label, e.g. a boat name or job number. */
  name: string
  /** Position of the item's centre, in world units (see WorkshopState.floor). */
  x: number
  y: number
  /** Footprint size in world units. */
  width: number
  height: number
  /** Rotation in degrees, clockwise. */
  rotation: number
  status: ItemStatus
  /** How the item is drawn on the floor. */
  shape: ItemShape
  notes?: string
  /** When the item arrived on site (ISO). Drives "days in yard". */
  arrivedAt?: string
  /** Target completion / collection / launch date (ISO date). */
  dueDate?: string
}

/** A named area of the floor: dry dock, paint bay, slipway, aisle… */
export interface Zone {
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
  /** Base colour for the zone fill/label. */
  color: string
  /** Marks circulation space the AI flags when something parks in it. */
  isAisle?: boolean
  /** Marks the launch/exit area (boats should leave from here). */
  isExit?: boolean
}

export interface FloorPlan {
  /** Uploaded floor-plan image as a data URL, or null for a blank grid. */
  imageDataUrl: string | null
  /** Size of the workshop in world units. The SVG viewBox maps to this. */
  width: number
  height: number
  /** Real-world width of the floor in metres, so items can be sized to scale. */
  metresWide?: number
}

export type MoveKind = 'move' | 'status' | 'add' | 'remove' | 'optimise' | 'scan'

export interface MoveEvent {
  id: string
  at: string // ISO timestamp
  kind: MoveKind
  text: string
}

export interface WorkshopState {
  /** Schema version so we can migrate saved layouts. */
  version: 2
  name: string
  floor: FloorPlan
  zones: Zone[]
  items: FloorItem[]
  /** Activity log — foundation for workflow analytics and the camera stage. */
  history?: MoveEvent[]
}

export const STATUS_LABELS: Record<ItemStatus, string> = {
  incoming: 'Incoming',
  in_progress: 'In progress',
  ready: 'Ready',
  blocked: 'Blocked',
}

export const STATUS_COLORS: Record<ItemStatus, string> = {
  incoming: '#3b82f6', // blue
  in_progress: '#f59e0b', // amber
  ready: '#22c55e', // green
  blocked: '#ef4444', // red
}

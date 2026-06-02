import type { FloorItem, ItemStatus, WorkshopState, Zone } from './types'

// Manager-facing logic: how long something has been on site (dwell), whether
// it's due / overdue, and the headline KPIs a supervisor runs their day from.

const DAY = 86_400_000

/** A stable, distinct colour for a tag, derived from its text. */
export function tagColor(tag: string): string {
  let h = 0
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) % 360
  return `hsl(${h} 60% 42%)`
}

/** All unique tags currently in use, sorted — for autocomplete. */
export function allTags(state: WorkshopState): string[] {
  const set = new Set<string>()
  for (const i of state.items) for (const t of i.tags ?? []) set.add(t)
  return [...set].sort((a, b) => a.localeCompare(b))
}

export function dwellDays(item: FloorItem): number {
  if (!item.arrivedAt) return 0
  return Math.max(0, Math.floor((Date.now() - new Date(item.arrivedAt).getTime()) / DAY))
}

export type DueState = 'none' | 'soon' | 'today' | 'overdue'

export function dueState(item: FloorItem): DueState {
  if (!item.dueDate) return 'none'
  const due = new Date(item.dueDate).getTime()
  const days = Math.floor((due - Date.now()) / DAY)
  if (days < 0) return 'overdue'
  if (days === 0) return 'today'
  if (days <= 3) return 'soon'
  return 'none'
}

export function dueLabel(item: FloorItem): string {
  if (!item.dueDate) return ''
  const due = new Date(item.dueDate)
  const days = Math.floor((due.getTime() - Date.now()) / DAY)
  if (days < 0) return `${-days}d overdue`
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  return `Due in ${days}d`
}

export function isFixture(item: FloorItem): boolean {
  return item.shape === 'door'
}

export interface KPIs {
  total: number
  ready: number
  blocked: number
  dueSoon: number
  overdue: number
  avgDwell: number
}

export function managerKPIs(state: WorkshopState): KPIs {
  const jobs = state.items.filter((i) => !isFixture(i))
  let dwellSum = 0
  let dueSoon = 0
  let overdue = 0
  for (const j of jobs) {
    dwellSum += dwellDays(j)
    const d = dueState(j)
    if (d === 'overdue') overdue++
    else if (d === 'soon' || d === 'today') dueSoon++
  }
  return {
    total: jobs.length,
    ready: jobs.filter((j) => j.status === 'ready').length,
    blocked: jobs.filter((j) => j.status === 'blocked').length,
    dueSoon,
    overdue,
    avgDwell: jobs.length ? Math.round(dwellSum / jobs.length) : 0,
  }
}

export function zoneOf(item: FloorItem, zones: Zone[]): Zone | null {
  // The last matching zone wins (smaller bays drawn over larger areas).
  let found: Zone | null = null
  for (const z of zones) {
    if (item.x >= z.x && item.x <= z.x + z.width && item.y >= z.y && item.y <= z.y + z.height) {
      found = z
    }
  }
  return found
}

export interface ZoneLoad {
  zone: Zone
  count: number
  fill: number // used footprint / zone area, 0..1
  over: boolean
}

/** Per-zone occupancy: how many jobs sit in each area and how full it is. */
export function zoneOccupancy(state: WorkshopState): ZoneLoad[] {
  const jobs = state.items.filter((i) => !isFixture(i))
  return state.zones
    .filter((z) => !z.isAisle)
    .map((zone) => {
      const inside = jobs.filter((j) => zoneOf(j, state.zones)?.id === zone.id)
      const used = inside.reduce((s, j) => s + j.width * j.height, 0)
      const fill = Math.min(1.5, used / Math.max(1, zone.width * zone.height))
      return { zone, count: inside.length, fill, over: fill > 0.85 }
    })
}

const ARRIVED_BIAS: Record<ItemStatus, number> = {
  incoming: 3,
  in_progress: 14,
  ready: 21,
  blocked: 34,
}

const DUE_OFFSET: Record<ItemStatus, number> = {
  incoming: 16,
  in_progress: 6,
  ready: 0,
  blocked: -3, // blocked jobs are typically already late
}

/**
 * Fills in realistic arrival and due dates for any item missing them, so the
 * manager view tells a believable story out of the box (blocked jobs run late,
 * ready jobs are due now, incoming ones have headroom). Deterministic spread
 * by index; never overwrites dates a user/save already has. Skips fixtures.
 */
export function seedItemDates(items: FloorItem[]): void {
  let i = 0
  for (const item of items) {
    if (isFixture(item)) continue
    const spread = i % 6
    if (!item.arrivedAt) {
      const days = ARRIVED_BIAS[item.status] + spread
      item.arrivedAt = new Date(Date.now() - days * DAY).toISOString()
    }
    if (item.dueDate === undefined && i % 4 !== 3) {
      const days = DUE_OFFSET[item.status] + (spread - 2)
      item.dueDate = new Date(Date.now() + days * DAY).toISOString()
    }
    i++
  }
}

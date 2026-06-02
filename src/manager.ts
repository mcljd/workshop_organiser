import type { FloorItem, ItemStatus, WorkshopState } from './types'

// Manager-facing logic: how long something has been on site (dwell), whether
// it's due / overdue, and the headline KPIs a supervisor runs their day from.

const DAY = 86_400_000

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

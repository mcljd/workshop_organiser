import type { FloorItem, WorkshopState, Zone } from './types'
import { dueLabel, dueState } from './manager'

// A lightweight, real heuristic analysis of a layout. It computes genuine
// geometry (overlaps, which zone each item sits in, aisle obstructions) and
// turns it into an efficiency score + ranked insights. This is the seed of
// the "AI workflow assistant" stage — today it's transparent rules; later the
// same surface can be driven by a model and real movement data.

export type Severity = 'good' | 'warn' | 'bad'

export interface Insight {
  id: string
  severity: Severity
  message: string
  /** Item this insight is about, so the UI can select it on click. */
  itemId?: string
}

export interface Analysis {
  score: number
  insights: Insight[]
  metrics: {
    items: number
    overlaps: number
    aisleBlocked: number
    ready: number
    blocked: number
    utilisation: number // 0..1 of usable floor footprint
  }
}

interface Box {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

function aabb(item: FloorItem): Box {
  // Axis-aligned bounding box. For rotated items we use the rotated extent so
  // collision stays sensible at any heading.
  const rad = (item.rotation * Math.PI) / 180
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))
  const w = (item.width * cos + item.height * sin) / 2
  const h = (item.width * sin + item.height * cos) / 2
  return { minX: item.x - w, minY: item.y - h, maxX: item.x + w, maxY: item.y + h }
}

function overlapArea(a: Box, b: Box): number {
  const w = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX)
  const h = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY)
  return w > 0 && h > 0 ? w * h : 0
}

function centreInZone(item: FloorItem, zone: Zone): boolean {
  return (
    item.x >= zone.x &&
    item.x <= zone.x + zone.width &&
    item.y >= zone.y &&
    item.y <= zone.y + zone.height
  )
}

export function analyse(state: WorkshopState): Analysis {
  const { zones, floor } = state
  // Doors and other detected fixtures aren't movable jobs — exclude them so
  // the workflow insights stay about the things that actually move.
  const items = state.items.filter((i) => i.shape !== 'door')
  const insights: Insight[] = []

  // --- Overlaps: two items sharing floor space is wasted/blocked time. ---
  const boxes = items.map(aabb)
  const overlapping = new Set<string>()
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (overlapArea(boxes[i], boxes[j]) > 200) {
        overlapping.add(items[i].id)
        overlapping.add(items[j].id)
        insights.push({
          id: `overlap-${items[i].id}-${items[j].id}`,
          severity: 'bad',
          message: `${items[i].name} and ${items[j].name} are overlapping — they can't both occupy that space.`,
          itemId: items[i].id,
        })
      }
    }
  }

  // --- Aisle obstruction: anything parked in circulation space. ---
  const aisles = zones.filter((z) => z.isAisle)
  let aisleBlocked = 0
  for (const item of items) {
    const b = aabb(item)
    for (const z of aisles) {
      const zb = { minX: z.x, minY: z.y, maxX: z.x + z.width, maxY: z.y + z.height }
      if (overlapArea(b, zb) > 400) {
        aisleBlocked++
        insights.push({
          id: `aisle-${item.id}`,
          severity: 'bad',
          message: `${item.name} is blocking the ${z.name.toLowerCase()} — clear the route for moves.`,
          itemId: item.id,
        })
        break
      }
    }
  }

  // --- Ready items should head for the exit/launch zone. ---
  const exits = zones.filter((z) => z.isExit)
  for (const item of items.filter((i) => i.status === 'ready')) {
    const atExit = exits.some((z) => centreInZone(item, z))
    if (exits.length && !atExit) {
      insights.push({
        id: `ready-${item.id}`,
        severity: 'warn',
        message: `${item.name} is ready — move it to ${exits[0].name} to free up its bay.`,
        itemId: item.id,
      })
    }
  }

  // --- Blocked items: surface them so they aren't forgotten. ---
  for (const item of items.filter((i) => i.status === 'blocked')) {
    insights.push({
      id: `blocked-${item.id}`,
      severity: 'warn',
      message: `${item.name} is blocked${item.notes ? ` — ${item.notes}` : ''}.`,
      itemId: item.id,
    })
  }

  // --- Due dates: overdue and due-today jobs need attention. ---
  let overdueCount = 0
  for (const item of items) {
    const ds = dueState(item)
    if (ds === 'overdue') {
      overdueCount++
      insights.push({
        id: `due-${item.id}`,
        severity: 'bad',
        message: `${item.name} is ${dueLabel(item).toLowerCase()} — prioritise it.`,
        itemId: item.id,
      })
    } else if (ds === 'today') {
      insights.push({
        id: `due-${item.id}`,
        severity: 'warn',
        message: `${item.name} is due today.`,
        itemId: item.id,
      })
    }
  }

  // --- Utilisation: footprint vs usable floor. ---
  const usedArea = items.reduce((sum, i) => sum + i.width * i.height, 0)
  const utilisation = Math.min(1, usedArea / (floor.width * floor.height))

  // --- Score: start at 100, deduct for problems. ---
  let score = 100
  score -= overlapping.size * 12
  score -= aisleBlocked * 10
  score -= overdueCount * 8
  score -= items.filter((i) => i.status === 'blocked').length * 4
  score = Math.max(0, Math.min(100, Math.round(score)))

  if (insights.length === 0) {
    insights.push({
      id: 'all-clear',
      severity: 'good',
      message: 'Layout looks clean — no overlaps or blocked routes. Nice.',
    })
  }

  // Order: bad first, then warnings, then good.
  const rank: Record<Severity, number> = { bad: 0, warn: 1, good: 2 }
  insights.sort((a, b) => rank[a.severity] - rank[b.severity])

  return {
    score,
    insights,
    metrics: {
      items: items.length,
      overlaps: overlapping.size,
      aisleBlocked,
      ready: items.filter((i) => i.status === 'ready').length,
      blocked: items.filter((i) => i.status === 'blocked').length,
      utilisation,
    },
  }
}

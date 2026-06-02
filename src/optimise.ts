import type { WorkshopState } from './types'

// A real layout optimiser — the "do it for me" counterpart to the analysis.
// It takes the current layout and returns improved target positions that:
//   • pull every "ready" job into the exit/launch zone, neatly packed,
//   • push anything out of circulation aisles,
//   • separate overlapping items,
//   • keep everything on the floor.
// Pure geometry, deterministic, runs in well under a frame. The caller
// animates items from their current spot to these targets.

export type Targets = Map<string, { x: number; y: number }>

interface P {
  x: number
  y: number
}

export function optimiseLayout(state: WorkshopState): Targets {
  const { floor, zones } = state
  const items = state.items.filter((i) => i.shape !== 'door')
  if (items.length === 0) return new Map()

  const exit = zones.find((z) => z.isExit) ?? null
  const aisles = zones.filter((z) => z.isAisle)

  const pos = new Map<string, P>(items.map((i) => [i.id, { x: i.x, y: i.y }]))
  const half = new Map(items.map((i) => [i.id, { hw: i.width / 2, hh: i.height / 2 }]))

  // Seed: pack "ready" items into the exit zone in tidy rows.
  const slots = new Map<string, P>()
  if (exit) {
    const pad = 18
    let cx = exit.x + pad
    let cy = exit.y + pad
    let rowH = 0
    for (const it of items.filter((i) => i.status === 'ready')) {
      if (cx + it.width > exit.x + exit.width - pad) {
        cx = exit.x + pad
        cy += rowH + pad
        rowH = 0
      }
      slots.set(it.id, { x: cx + it.width / 2, y: cy + it.height / 2 })
      cx += it.width + pad
      rowH = Math.max(rowH, it.height)
    }
    for (const [id, s] of slots) pos.set(id, { ...s })
  }

  const gap = 12
  for (let iter = 0; iter < 90; iter++) {
    // Separate overlapping pairs along their shallower axis.
    for (let a = 0; a < items.length; a++) {
      for (let b = a + 1; b < items.length; b++) {
        const pa = pos.get(items[a].id)!
        const pb = pos.get(items[b].id)!
        const ha = half.get(items[a].id)!
        const hb = half.get(items[b].id)!
        const dx = pb.x - pa.x
        const dy = pb.y - pa.y
        const ox = ha.hw + hb.hw + gap - Math.abs(dx)
        const oy = ha.hh + hb.hh + gap - Math.abs(dy)
        if (ox > 0 && oy > 0) {
          if (ox < oy) {
            const s = ((dx < 0 ? -1 : 1) * ox) / 2
            pa.x -= s
            pb.x += s
          } else {
            const s = ((dy < 0 ? -1 : 1) * oy) / 2
            pa.y -= s
            pb.y += s
          }
        }
      }
    }

    // Push anything sitting in an aisle out to the nearer side.
    for (const it of items) {
      const p = pos.get(it.id)!
      const h = half.get(it.id)!
      for (const z of aisles) {
        if (p.x > z.x && p.x < z.x + z.width && p.y > z.y && p.y < z.y + z.height) {
          if (z.width >= z.height) {
            const toTop = p.y - z.y
            const toBot = z.y + z.height - p.y
            p.y = toTop < toBot ? z.y - h.hh - 8 : z.y + z.height + h.hh + 8
          } else {
            const toL = p.x - z.x
            const toR = z.x + z.width - p.x
            p.x = toL < toR ? z.x - h.hw - 8 : z.x + z.width + h.hw + 8
          }
        }
      }
    }

    // Spring "ready" items back toward their exit slot.
    for (const [id, slot] of slots) {
      const p = pos.get(id)!
      p.x += (slot.x - p.x) * 0.3
      p.y += (slot.y - p.y) * 0.3
    }

    // Keep everything on the floor.
    for (const it of items) {
      const p = pos.get(it.id)!
      const h = half.get(it.id)!
      p.x = Math.max(h.hw, Math.min(floor.width - h.hw, p.x))
      p.y = Math.max(h.hh, Math.min(floor.height - h.hh, p.y))
    }
  }

  return new Map(items.map((i) => [i.id, { x: pos.get(i.id)!.x, y: pos.get(i.id)!.y }]))
}

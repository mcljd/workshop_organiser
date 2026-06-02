import { useRef, useState } from 'react'
import type { FloorPlan, Zone } from '../types'
import { newId } from '../storage'

interface Props {
  floor: FloorPlan
  zones: Zone[]
  onDone: (zones: Zone[]) => void
  onCancel: () => void
}

const COLORS = ['#6366f1', '#14b8a6', '#f97316', '#a855f7', '#0ea5e9', '#22c55e', '#ef4444', '#64748b']

type ZoneType = 'area' | 'aisle' | 'exit'
const typeOf = (z: Zone): ZoneType => (z.isAisle ? 'aisle' : z.isExit ? 'exit' : 'area')

type Drag =
  | { kind: 'none' }
  | { kind: 'draw'; sx: number; sy: number }
  | { kind: 'move'; id: string; ox: number; oy: number }
  | { kind: 'resize'; id: string }

/**
 * Top-down editor for sheds / areas over the floor-plan image. Draw new areas,
 * move and resize them, rename, recolour, mark aisles/exits, and delete —
 * before populating the site with vehicles.
 */
export function ZoneEditor({ floor, zones: initial, onDone, onCancel }: Props) {
  const [zones, setZones] = useState<Zone[]>(initial)
  const [sel, setSel] = useState<string | null>(null)
  const [draft, setDraft] = useState<Zone | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const drag = useRef<Drag>({ kind: 'none' })

  const selected = zones.find((z) => z.id === sel) ?? null

  function toWorld(e: React.PointerEvent) {
    const svg = svgRef.current!
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const ctm = svg.getScreenCTM()
    const p = pt.matrixTransform(ctm!.inverse())
    return { x: p.x, y: p.y }
  }

  function patch(id: string, p: Partial<Zone>) {
    setZones((zs) => zs.map((z) => (z.id === id ? { ...z, ...p } : z)))
  }

  function onBgDown(e: React.PointerEvent) {
    const t = e.target as Element
    if (t === svgRef.current || t.id === 'ze-bg') {
      const { x, y } = toWorld(e)
      drag.current = { kind: 'draw', sx: x, sy: y }
      setSel(null)
      svgRef.current?.setPointerCapture(e.pointerId)
    }
  }

  function onZoneDown(e: React.PointerEvent, z: Zone) {
    e.stopPropagation()
    setSel(z.id)
    const { x, y } = toWorld(e)
    drag.current = { kind: 'move', id: z.id, ox: x - z.x, oy: y - z.y }
    svgRef.current?.setPointerCapture(e.pointerId)
  }

  function onHandleDown(e: React.PointerEvent, z: Zone) {
    e.stopPropagation()
    setSel(z.id)
    drag.current = { kind: 'resize', id: z.id }
    svgRef.current?.setPointerCapture(e.pointerId)
  }

  function onMove(e: React.PointerEvent) {
    const d = drag.current
    if (d.kind === 'none') return
    const { x, y } = toWorld(e)
    if (d.kind === 'draw') {
      setDraft({
        id: 'draft',
        name: 'New area',
        x: Math.min(d.sx, x),
        y: Math.min(d.sy, y),
        width: Math.abs(x - d.sx),
        height: Math.abs(y - d.sy),
        color: COLORS[zones.length % COLORS.length],
      })
    } else if (d.kind === 'move') {
      patch(d.id, {
        x: clamp(x - d.ox, 0, floor.width),
        y: clamp(y - d.oy, 0, floor.height),
      })
    } else if (d.kind === 'resize') {
      const z = zones.find((zz) => zz.id === d.id)!
      patch(d.id, { width: Math.max(20, x - z.x), height: Math.max(20, y - z.y) })
    }
  }

  function onUp(e: React.PointerEvent) {
    if (drag.current.kind === 'draw' && draft && draft.width > 24 && draft.height > 24) {
      const z = { ...draft, id: newId() }
      setZones((zs) => [...zs, z])
      setSel(z.id)
    }
    setDraft(null)
    drag.current = { kind: 'none' }
    svgRef.current?.releasePointerCapture(e.pointerId)
  }

  function setType(id: string, t: ZoneType) {
    patch(id, { isAisle: t === 'aisle' || undefined, isExit: t === 'exit' || undefined })
  }

  const vw = floor.width
  const vh = floor.height

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Edit sheds and areas">
      <div className="zone-editor">
        <div className="ze-head">
          <div>
            <h2>Edit sheds &amp; areas</h2>
            <p className="muted">
              Drag on the plan to add an area. Click one to move, resize, rename or mark it as an
              aisle/exit. Then place vehicles inside.
            </p>
          </div>
          <button className="wizard-close" onClick={onCancel} aria-label="Cancel">
            ✕
          </button>
        </div>

        <div className="ze-body">
          <div className="ze-canvas-wrap">
            <svg
              ref={svgRef}
              className="ze-canvas"
              viewBox={`0 0 ${vw} ${vh}`}
              preserveAspectRatio="xMidYMid meet"
              onPointerDown={onBgDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
            >
              <rect id="ze-bg" x={0} y={0} width={vw} height={vh} fill="#eef2f7" />
              {floor.imageDataUrl && (
                <image
                  href={floor.imageDataUrl}
                  x={0}
                  y={0}
                  width={vw}
                  height={vh}
                  preserveAspectRatio="xMidYMid meet"
                  style={{ pointerEvents: 'none' }}
                />
              )}
              {zones.map((z) => (
                <g key={z.id}>
                  <rect
                    x={z.x}
                    y={z.y}
                    width={z.width}
                    height={z.height}
                    fill={z.color}
                    fillOpacity={z.isAisle ? 0.18 : 0.28}
                    stroke={z.id === sel ? '#0f172a' : z.color}
                    strokeWidth={z.id === sel ? 4 : 2}
                    strokeDasharray={z.isAisle ? '10 6' : undefined}
                    onPointerDown={(e) => onZoneDown(e, z)}
                    style={{ cursor: 'move' }}
                  />
                  <text x={z.x + 8} y={z.y + 24} fontSize={18} fill="#0f172a" fontWeight={700} style={{ pointerEvents: 'none' }}>
                    {z.name}
                    {z.isExit ? ' ⤴' : ''}
                  </text>
                  {z.id === sel && (
                    <rect
                      x={z.x + z.width - 14}
                      y={z.y + z.height - 14}
                      width={20}
                      height={20}
                      fill="#0f172a"
                      onPointerDown={(e) => onHandleDown(e, z)}
                      style={{ cursor: 'nwse-resize' }}
                    />
                  )}
                </g>
              ))}
              {draft && (
                <rect
                  x={draft.x}
                  y={draft.y}
                  width={draft.width}
                  height={draft.height}
                  fill="#2563eb"
                  fillOpacity={0.2}
                  stroke="#2563eb"
                  strokeWidth={2}
                />
              )}
            </svg>
          </div>

          <div className="ze-props">
            {selected ? (
              <>
                <label className="field">
                  <span>Name</span>
                  <input value={selected.name} onChange={(e) => patch(selected.id, { name: e.target.value })} />
                </label>
                <label className="field">
                  <span>Type</span>
                  <select value={typeOf(selected)} onChange={(e) => setType(selected.id, e.target.value as ZoneType)}>
                    <option value="area">Shed / area</option>
                    <option value="aisle">Aisle (keep clear)</option>
                    <option value="exit">Exit / launch</option>
                  </select>
                </label>
                <div className="field">
                  <span>Colour</span>
                  <div className="swatches">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        className={`sw ${selected.color === c ? 'on' : ''}`}
                        style={{ background: c }}
                        onClick={() => patch(selected.id, { color: c })}
                        aria-label={`Colour ${c}`}
                      />
                    ))}
                  </div>
                </div>
                <button
                  className="danger"
                  onClick={() => {
                    setZones((zs) => zs.filter((z) => z.id !== selected.id))
                    setSel(null)
                  }}
                >
                  Delete area
                </button>
              </>
            ) : (
              <p className="muted">Select an area to edit it, or drag on the plan to add one.</p>
            )}
          </div>
        </div>

        <div className="ze-foot">
          <span className="muted">{zones.length} area{zones.length === 1 ? '' : 's'}</span>
          <div className="review-foot-actions">
            <button className="ghost" onClick={onCancel}>
              Cancel
            </button>
            <button className="primary" onClick={() => onDone(zones)}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

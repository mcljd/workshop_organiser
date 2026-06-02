import { useEffect, useRef, useState } from 'react'
import type { FloorItem, FloorPlan } from '../types'
import { STATUS_COLORS } from '../types'

interface ViewBox {
  x: number
  y: number
  w: number
  h: number
}

interface Props {
  floor: FloorPlan
  items: FloorItem[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onMoveItem: (id: string, x: number, y: number) => void
}

type DragState =
  | { kind: 'none' }
  | { kind: 'pan'; startClientX: number; startClientY: number; startView: ViewBox }
  | { kind: 'item'; id: string; offsetX: number; offsetY: number }

/**
 * Top-down floor map. Renders an optional floor-plan image plus draggable
 * item rectangles. Supports wheel-zoom (towards the cursor) and click-drag
 * panning on empty space. All maths is done in "world units" via the SVG
 * viewBox, so dragging stays accurate at any zoom level.
 */
export function FloorCanvas({ floor, items, selectedId, onSelect, onMoveItem }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [view, setView] = useState<ViewBox>({ x: 0, y: 0, w: floor.width, h: floor.height })
  const drag = useRef<DragState>({ kind: 'none' })

  // Reset the view whenever the floor dimensions change (e.g. new floor plan).
  useEffect(() => {
    setView({ x: 0, y: 0, w: floor.width, h: floor.height })
  }, [floor.width, floor.height])

  /** Convert a screen/client point into world (viewBox) coordinates. */
  function toWorld(clientX: number, clientY: number) {
    const svg = svgRef.current!
    const pt = svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: clientX, y: clientY }
    const world = pt.matrixTransform(ctm.inverse())
    return { x: world.x, y: world.y }
  }

  function onWheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault()
    const { x: wx, y: wy } = toWorld(e.clientX, e.clientY)
    const factor = e.deltaY > 0 ? 1.1 : 1 / 1.1
    const newW = clamp(view.w * factor, floor.width * 0.1, floor.width * 4)
    const newH = clamp(view.h * factor, floor.height * 0.1, floor.height * 4)
    // Keep the point under the cursor fixed while zooming.
    const newX = wx - ((wx - view.x) * newW) / view.w
    const newY = wy - ((wy - view.y) * newH) / view.h
    setView({ x: newX, y: newY, w: newW, h: newH })
  }

  function onPointerDownBackground(e: React.PointerEvent<SVGSVGElement>) {
    // Only start a pan when the empty background itself is the target.
    if (e.target === svgRef.current || (e.target as Element).id === 'floor-bg') {
      onSelect(null)
      drag.current = {
        kind: 'pan',
        startClientX: e.clientX,
        startClientY: e.clientY,
        startView: view,
      }
      svgRef.current?.setPointerCapture(e.pointerId)
    }
  }

  function onPointerDownItem(e: React.PointerEvent, item: FloorItem) {
    e.stopPropagation()
    onSelect(item.id)
    const world = toWorld(e.clientX, e.clientY)
    drag.current = {
      kind: 'item',
      id: item.id,
      offsetX: world.x - item.x,
      offsetY: world.y - item.y,
    }
    svgRef.current?.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current
    if (d.kind === 'pan') {
      // Convert the pixel delta into world units using the current scale.
      const scaleX = view.w / svgRef.current!.clientWidth
      const scaleY = view.h / svgRef.current!.clientHeight
      const dx = (e.clientX - d.startClientX) * scaleX
      const dy = (e.clientY - d.startClientY) * scaleY
      setView({ ...d.startView, x: d.startView.x - dx, y: d.startView.y - dy })
    } else if (d.kind === 'item') {
      const world = toWorld(e.clientX, e.clientY)
      onMoveItem(d.id, world.x - d.offsetX, world.y - d.offsetY)
    }
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    drag.current = { kind: 'none' }
    svgRef.current?.releasePointerCapture(e.pointerId)
  }

  const viewBox = `${view.x} ${view.y} ${view.w} ${view.h}`

  return (
    <svg
      ref={svgRef}
      className="floor-canvas"
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      onWheel={onWheel}
      onPointerDown={onPointerDownBackground}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      <GridDefs />

      {/* Floor background: uploaded image, or a grid-filled rectangle. */}
      <rect
        id="floor-bg"
        x={0}
        y={0}
        width={floor.width}
        height={floor.height}
        fill={floor.imageDataUrl ? 'transparent' : 'url(#grid)'}
        stroke="#cbd5e1"
        strokeWidth={2}
      />
      {floor.imageDataUrl && (
        <image
          href={floor.imageDataUrl}
          x={0}
          y={0}
          width={floor.width}
          height={floor.height}
          preserveAspectRatio="xMidYMid meet"
          style={{ pointerEvents: 'none' }}
        />
      )}

      {items.map((item) => (
        <ItemShape
          key={item.id}
          item={item}
          selected={item.id === selectedId}
          onPointerDown={(e) => onPointerDownItem(e, item)}
        />
      ))}
    </svg>
  )
}

function ItemShape({
  item,
  selected,
  onPointerDown,
}: {
  item: FloorItem
  selected: boolean
  onPointerDown: (e: React.PointerEvent) => void
}) {
  const color = STATUS_COLORS[item.status]
  return (
    <g
      transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`}
      onPointerDown={onPointerDown}
      style={{ cursor: 'grab' }}
    >
      <rect
        x={-item.width / 2}
        y={-item.height / 2}
        width={item.width}
        height={item.height}
        rx={8}
        fill={color}
        fillOpacity={0.85}
        stroke={selected ? '#0f172a' : color}
        strokeWidth={selected ? 4 : 2}
      />
      {/* Bow marker so orientation is readable at a glance. */}
      <circle cx={item.width / 2 - 14} cy={0} r={6} fill="#ffffff" fillOpacity={0.9} />
      <text
        x={0}
        y={0}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={Math.max(14, item.height * 0.3)}
        fill="#0f172a"
        fontWeight={600}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {item.name}
      </text>
    </g>
  )
}

function GridDefs() {
  return (
    <defs>
      <pattern id="grid" width={40} height={40} patternUnits="userSpaceOnUse">
        <rect width={40} height={40} fill="#f8fafc" />
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e2e8f0" strokeWidth={1} />
      </pattern>
    </defs>
  )
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}

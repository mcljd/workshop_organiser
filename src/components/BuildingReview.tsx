import { useRef, useState } from 'react'
import type { Building, BuildingScan } from '../buildings'
import { loadLearned } from '../buildings'

interface Props {
  scan: BuildingScan
  onConfirm: (buildings: Building[], metresWide: number, alsoObjects: boolean) => void
  onCancel: () => void
}

/**
 * Shows the aerial image with the AI's detected buildings overlaid so the user
 * can see what it found, tick/✗ each one, rename them, and drag to add any it
 * missed. The kept set (and the site scale) is handed back to build the site.
 */
export function BuildingReview({ scan, onConfirm, onCancel }: Props) {
  const [buildings, setBuildings] = useState<Building[]>(scan.buildings)
  const [metres, setMetres] = useState(60)
  const [alsoObjects, setAlsoObjects] = useState(true)
  const [scaleMode, setScaleMode] = useState(false)
  const [scalePts, setScalePts] = useState<{ x: number; y: number }[]>([])
  const [scaleDist, setScaleDist] = useState('')
  const svgRef = useRef<SVGSVGElement | null>(null)
  const draw = useRef<{ x: number; y: number } | null>(null)
  const [draft, setDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  const keptCount = buildings.filter((b) => b.keep).length

  function toNorm(e: React.PointerEvent) {
    const r = svgRef.current!.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    }
  }

  function toggle(id: string) {
    setBuildings((bs) => bs.map((b) => (b.id === id ? { ...b, keep: !b.keep } : b)))
  }
  function rename(id: string, name: string) {
    setBuildings((bs) => bs.map((b) => (b.id === id ? { ...b, name } : b)))
  }
  function remove(id: string) {
    setBuildings((bs) => bs.filter((b) => b.id !== id))
  }

  function onDown(e: React.PointerEvent) {
    if (scaleMode) {
      const p = toNorm(e)
      setScalePts((prev) => (prev.length >= 2 ? [p] : [...prev, p]))
      return
    }
    if ((e.target as Element).getAttribute('data-rect')) return // clicking a rect toggles it
    draw.current = toNorm(e)
    svgRef.current?.setPointerCapture(e.pointerId)
  }

  function applyScale() {
    const dm = Number(scaleDist)
    if (scalePts.length < 2 || !dm) return
    const FW = 1200
    const FH = FW / scan.aspect
    const dx = (scalePts[1].x - scalePts[0].x) * FW
    const dy = (scalePts[1].y - scalePts[0].y) * FH
    const dw = Math.hypot(dx, dy)
    if (dw > 0) setMetres(Math.round((FW * dm) / dw))
    setScaleMode(false)
  }
  function onMove(e: React.PointerEvent) {
    if (!draw.current) return
    const p = toNorm(e)
    setDraft({
      x: Math.min(draw.current.x, p.x),
      y: Math.min(draw.current.y, p.y),
      w: Math.abs(p.x - draw.current.x),
      h: Math.abs(p.y - draw.current.y),
    })
  }
  function onUp() {
    if (draft && draft.w > 0.02 && draft.h > 0.02) {
      setBuildings((bs) => [
        ...bs,
        {
          id: `u${Date.now()}`,
          ...draft,
          score: 1,
          name: `Shed ${bs.length + 1}`,
          keep: true,
        },
      ])
    }
    draw.current = null
    setDraft(null)
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Review detected buildings">
      <div className="review">
        <div className="review-head">
          <div>
            <h2>Here's what I found</h2>
            <p className="muted">
              Tick the buildings to keep, ✗ the wrong ones, rename them, or drag on the
              image to add one I missed. I'll learn from your choices.
            </p>
            {loadLearned().n > 0 && (
              <p className="learned">🧠 Tuned from {loadLearned().n} of your past scan{loadLearned().n === 1 ? '' : 's'}</p>
            )}
          </div>
          <button className="wizard-close" onClick={onCancel} aria-label="Cancel">
            ✕
          </button>
        </div>

        <div className="review-body">
          <div className="review-image" style={{ aspectRatio: String(scan.aspect) }}>
            <img src={scan.imageDataUrl} alt="Aerial view" />
            <svg
              ref={svgRef}
              className="review-overlay"
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
            >
              {buildings.map((b, i) => (
                <g key={b.id}>
                  <rect
                    data-rect="1"
                    x={b.x}
                    y={b.y}
                    width={b.w}
                    height={b.h}
                    onClick={() => toggle(b.id)}
                    fill={b.keep ? 'rgba(34,197,94,0.18)' : 'rgba(148,163,184,0.12)'}
                    stroke={b.keep ? '#16a34a' : '#94a3b8'}
                    strokeWidth={0.004}
                    strokeDasharray={b.keep ? undefined : '0.012 0.008'}
                    style={{ cursor: 'pointer' }}
                  />
                  <text
                    x={b.x + 0.008}
                    y={b.y + 0.032}
                    fontSize={0.026}
                    fill={b.keep ? '#15803d' : '#64748b'}
                    style={{ pointerEvents: 'none', fontWeight: 700 }}
                  >
                    {b.keep ? '✓' : '✗'} {i + 1}
                  </text>
                </g>
              ))}
              {draft && (
                <rect
                  x={draft.x}
                  y={draft.y}
                  width={draft.w}
                  height={draft.h}
                  fill="rgba(37,99,235,0.15)"
                  stroke="#2563eb"
                  strokeWidth={0.004}
                />
              )}
              {scalePts.length === 2 && (
                <line
                  x1={scalePts[0].x}
                  y1={scalePts[0].y}
                  x2={scalePts[1].x}
                  y2={scalePts[1].y}
                  stroke="#dc2626"
                  strokeWidth={0.005}
                />
              )}
              {scalePts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={0.008} fill="#dc2626" />
              ))}
            </svg>
            {scaleMode && (
              <div className="scale-hint">
                {scalePts.length < 2
                  ? `Tap point ${scalePts.length + 1} of 2 on a known distance`
                  : 'Enter the real distance between the points'}
                {scalePts.length === 2 && (
                  <span className="scale-apply">
                    <input
                      type="number"
                      min={0.1}
                      step={0.1}
                      placeholder="metres"
                      value={scaleDist}
                      onChange={(e) => setScaleDist(e.target.value)}
                    />
                    <button className="primary" onClick={applyScale}>
                      Set
                    </button>
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="review-list">
            {buildings.map((b, i) => (
              <div key={b.id} className={`review-row ${b.keep ? '' : 'dropped'}`}>
                <button
                  className={`tick ${b.keep ? 'on' : ''}`}
                  onClick={() => toggle(b.id)}
                  aria-label={b.keep ? `Drop ${b.name}` : `Keep ${b.name}`}
                  title={b.keep ? 'Keep' : 'Dropped'}
                >
                  {b.keep ? '✓' : '✗'}
                </button>
                <span className="review-num">{i + 1}</span>
                <input value={b.name} onChange={(e) => rename(b.id, e.target.value)} />
                <span className="review-size" title="Rough size from the site-width scale">
                  ≈{Math.round(b.w * metres)}×{Math.round((b.h * metres) / scan.aspect)}m
                </span>
                <span className="conf" title={`Confidence ${Math.round(b.score * 100)}%`}>
                  <span style={{ width: `${Math.round(b.score * 100)}%` }} />
                </span>
                <button className="row-x" onClick={() => remove(b.id)} aria-label={`Delete ${b.name}`}>
                  🗑
                </button>
              </div>
            ))}
            {buildings.length === 0 && (
              <p className="muted">No buildings yet — drag on the image to add one.</p>
            )}
          </div>
        </div>

        <div className="review-foot">
          <div className="review-foot-opts">
            <label className="review-scale">
              Site width
              <input
                type="number"
                min={5}
                value={metres}
                onChange={(e) => setMetres(Number(e.target.value) || 60)}
              />
              m
            </label>
            <button
              className={`ghost ${scaleMode ? 'on' : ''}`}
              onClick={() => {
                setScaleMode((m) => !m)
                setScalePts([])
              }}
              title="Tap two points of a known real distance to set the scale"
            >
              📏 {scaleMode ? 'Cancel scale' : 'Set scale'}
            </button>
            <label className="review-check">
              <input
                type="checkbox"
                checked={alsoObjects}
                onChange={(e) => setAlsoObjects(e.target.checked)}
              />
              Also find boats/vehicles (AI)
            </label>
          </div>
          <div className="review-foot-actions">
            <button className="ghost" onClick={onCancel}>
              Cancel
            </button>
            <button
              className="primary"
              disabled={keptCount === 0}
              onClick={() => onConfirm(buildings, metres, alsoObjects)}
            >
              Use {keptCount} building{keptCount === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

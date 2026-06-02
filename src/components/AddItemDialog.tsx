import { useState } from 'react'
import type { FloorItem, FloorPlan, Zone } from '../types'
import { newId } from '../storage'

interface Props {
  floor: FloorPlan
  zones: Zone[]
  onAdd: (item: FloorItem, metresWide: number) => void
  onClose: () => void
}

const KINDS = [
  { key: 'boat', label: 'Boat', shape: 'boat' as const, len: 6.5, beam: 2.4 },
  { key: 'vehicle', label: 'Vehicle', shape: 'box' as const, len: 4.5, beam: 1.9 },
  { key: 'trailer', label: 'Trailer', shape: 'box' as const, len: 7, beam: 2.5 },
  { key: 'pallet', label: 'Pallet / object', shape: 'box' as const, len: 1.2, beam: 1.0 },
]

/** Add an item by real-world size (metres), optionally dropped into a zone. */
export function AddItemDialog({ floor, zones, onAdd, onClose }: Props) {
  const [kind, setKind] = useState(KINDS[0])
  const [name, setName] = useState('')
  const [lenM, setLenM] = useState(kind.len)
  const [beamM, setBeamM] = useState(kind.beam)
  const [metres, setMetres] = useState(floor.metresWide ?? 60)
  const [zoneId, setZoneId] = useState('')

  function pick(k: (typeof KINDS)[number]) {
    setKind(k)
    setLenM(k.len)
    setBeamM(k.beam)
  }

  function add() {
    const unitsPerM = floor.width / Math.max(1, metres)
    const zone = zones.find((z) => z.id === zoneId)
    const cx = zone ? zone.x + zone.width / 2 : floor.width / 2
    const cy = zone ? zone.y + zone.height / 2 : floor.height / 2
    onAdd(
      {
        id: newId(),
        name: name.trim() || `${kind.label} (${lenM}m)`,
        x: cx,
        y: cy,
        width: Math.max(20, lenM * unitsPerM),
        height: Math.max(16, beamM * unitsPerM),
        rotation: 0,
        status: 'incoming',
        shape: kind.shape,
        arrivedAt: new Date().toISOString(),
      },
      metres,
    )
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Add an item">
      <div className="wizard add-dialog">
        <button className="wizard-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <div className="wizard-body">
          <div className="wizard-kicker">Add to the floor</div>
          <h1>Add an item by size</h1>
          <p className="lead">Pick what it is and its real dimensions — it's drawn to scale.</p>

          <div className="wfield">
            <span>Type</span>
            <div className="choice-grid">
              {KINDS.map((k) => (
                <button
                  key={k.key}
                  className={`choice ${kind.key === k.key ? 'active' : ''}`}
                  onClick={() => pick(k)}
                >
                  {k.label}
                </button>
              ))}
            </div>
          </div>

          <label className="wfield">
            <span>Name (optional)</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`e.g. ${kind.label} 1`} />
          </label>

          <div className="wfield-row">
            <label className="wfield">
              <span>Length (m)</span>
              <input type="number" min={0.5} step={0.1} value={lenM} onChange={(e) => setLenM(Number(e.target.value))} />
            </label>
            <label className="wfield">
              <span>Width / beam (m)</span>
              <input type="number" min={0.5} step={0.1} value={beamM} onChange={(e) => setBeamM(Number(e.target.value))} />
            </label>
          </div>

          <div className="wfield-row">
            <label className="wfield">
              <span>Place in</span>
              <select value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
                <option value="">Centre of floor</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="wfield">
              <span>Site width (m)</span>
              <input type="number" min={5} value={metres} onChange={(e) => setMetres(Number(e.target.value) || 60)} />
            </label>
          </div>

          <div className="wizard-actions">
            <button className="primary" onClick={add}>
              Add to floor
            </button>
            <button className="ghost" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

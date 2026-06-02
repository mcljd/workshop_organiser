import type { FloorItem, ItemStatus } from '../types'
import { STATUS_COLORS, STATUS_LABELS } from '../types'

interface Props {
  item: FloorItem | null
  itemCount: number
  onChange: (patch: Partial<FloorItem>) => void
  onDelete: () => void
}

const STATUSES: ItemStatus[] = ['incoming', 'in_progress', 'ready', 'blocked']

/** Right-hand panel for editing the currently selected item. */
export function Sidebar({ item, itemCount, onChange, onDelete }: Props) {
  if (!item) {
    return (
      <aside className="sidebar">
        <h2>Details</h2>
        <p className="muted">
          {itemCount === 0
            ? 'No items yet. Use “Add boat” to place one.'
            : 'Select an item on the floor to edit it.'}
        </p>
        <Legend />
      </aside>
    )
  }

  return (
    <aside className="sidebar">
      <h2>Details</h2>

      <label className="field">
        <span>Name</span>
        <input
          type="text"
          value={item.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </label>

      <label className="field">
        <span>Status</span>
        <select
          value={item.status}
          onChange={(e) => onChange({ status: e.target.value as ItemStatus })}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </label>

      <div className="field-row">
        <label className="field">
          <span>Width</span>
          <input
            type="number"
            min={20}
            value={Math.round(item.width)}
            onChange={(e) => onChange({ width: clampNum(e.target.value, 20, 2000) })}
          />
        </label>
        <label className="field">
          <span>Length</span>
          <input
            type="number"
            min={20}
            value={Math.round(item.height)}
            onChange={(e) => onChange({ height: clampNum(e.target.value, 20, 2000) })}
          />
        </label>
      </div>

      <label className="field">
        <span>Rotation: {Math.round(item.rotation)}°</span>
        <input
          type="range"
          min={0}
          max={360}
          value={item.rotation}
          onChange={(e) => onChange({ rotation: Number(e.target.value) })}
        />
      </label>

      <label className="field">
        <span>Notes</span>
        <textarea
          rows={3}
          value={item.notes ?? ''}
          onChange={(e) => onChange({ notes: e.target.value })}
          placeholder="Job number, customer, work needed…"
        />
      </label>

      <button className="danger" onClick={onDelete}>
        Delete item
      </button>

      <Legend />
    </aside>
  )
}

function Legend() {
  return (
    <div className="legend">
      <h3>Status key</h3>
      {(Object.keys(STATUS_LABELS) as ItemStatus[]).map((s) => (
        <div key={s} className="legend-row">
          <span className="swatch" style={{ background: STATUS_COLORS[s] }} />
          {STATUS_LABELS[s]}
        </div>
      ))}
    </div>
  )
}

function clampNum(value: string, min: number, max: number) {
  const n = Number(value)
  if (Number.isNaN(n)) return min
  return Math.min(max, Math.max(min, n))
}

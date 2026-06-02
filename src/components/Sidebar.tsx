import { useState } from 'react'
import type { FloorItem, ItemStatus } from '../types'
import { STATUS_LABELS } from '../types'
import { dueLabel, dueState, dwellDays, tagColor } from '../manager'

interface Props {
  item: FloorItem | null
  itemCount: number
  allTags: string[]
  onChange: (patch: Partial<FloorItem>) => void
  onDelete: () => void
}

const STATUSES: ItemStatus[] = ['incoming', 'in_progress', 'ready', 'blocked']

/** Edit panel for the currently selected item. */
export function Sidebar({ item, itemCount, allTags, onChange, onDelete }: Props) {
  const [tagInput, setTagInput] = useState('')

  function addTag(raw: string) {
    const t = raw.trim()
    if (!t || !item) return
    const tags = item.tags ?? []
    if (!tags.some((x) => x.toLowerCase() === t.toLowerCase())) {
      onChange({ tags: [...tags, t] })
    }
    setTagInput('')
  }

  if (!item) {
    return (
      <div className="sidebar-empty">
        <p className="muted">
          {itemCount === 0
            ? 'No items yet. Use “Add item” to place one.'
            : 'Click an item in the 3D view to edit it.'}
        </p>
      </div>
    )
  }

  return (
    <div className="sidebar-edit">
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

      <div className="field-row">
        <label className="field">
          <span>Due date</span>
          <input
            type="date"
            value={item.dueDate ? item.dueDate.slice(0, 10) : ''}
            onChange={(e) =>
              onChange({
                dueDate: e.target.value ? new Date(e.target.value).toISOString() : undefined,
              })
            }
          />
        </label>
        <div className="field">
          <span>On site</span>
          <div className="stat-line">
            <strong>{dwellDays(item)} days</strong>
            {item.dueDate && (
              <span className={`due-pill due-${dueState(item)}`}>{dueLabel(item)}</span>
            )}
          </div>
        </div>
      </div>

      <label className="field">
        <span>Notes</span>
        <textarea
          rows={3}
          value={item.notes ?? ''}
          onChange={(e) => onChange({ notes: e.target.value })}
          placeholder="Job number, customer, work needed…"
        />
      </label>

      <div className="field">
        <span>Tags</span>
        <div className="tag-edit">
          {(item.tags ?? []).map((t) => (
            <span key={t} className="tag" style={{ background: tagColor(t) }}>
              {t}
              <button
                onClick={() => onChange({ tags: (item.tags ?? []).filter((x) => x !== t) })}
                aria-label={`Remove tag ${t}`}
              >
                ×
              </button>
            </span>
          ))}
          <input
            className="tag-input"
            list="all-tags"
            value={tagInput}
            placeholder="Add tag…"
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addTag(tagInput)
              }
            }}
            onBlur={() => tagInput && addTag(tagInput)}
          />
          <datalist id="all-tags">
            {allTags.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
      </div>

      <button className="danger" onClick={onDelete}>
        Delete item
      </button>
    </div>
  )
}

function clampNum(value: string, min: number, max: number) {
  const n = Number(value)
  if (Number.isNaN(n)) return min
  return Math.min(max, Math.max(min, n))
}

import { useMemo, useState } from 'react'
import type { WorkshopState } from '../types'
import { STATUS_COLORS, STATUS_LABELS } from '../types'
import {
  dueLabel,
  dueState,
  dwellDays,
  isFixture,
  managerKPIs,
  tagColor,
  zoneOccupancy,
} from '../manager'

interface Props {
  state: WorkshopState
  selectedId: string | null
  onSelect: (id: string) => void
}

type SortKey = 'dwell' | 'due' | 'name' | 'status'

/** The manager cockpit: headline KPIs plus a searchable, sortable job list. */
export function ManagerPanel({ state, selectedId, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('due')

  const kpis = useMemo(() => managerKPIs(state), [state])
  const loads = useMemo(() => zoneOccupancy(state), [state])
  const history = state.history ?? []

  const jobs = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = state.items.filter(
      (i) =>
        !isFixture(i) &&
        (!q ||
          i.name.toLowerCase().includes(q) ||
          STATUS_LABELS[i.status].toLowerCase().includes(q) ||
          (i.tags ?? []).some((t) => t.toLowerCase().includes(q))),
    )
    const dueRank = (id: string) => {
      const it = state.items.find((x) => x.id === id)!
      const s = dueState(it)
      return s === 'overdue' ? 0 : s === 'today' ? 1 : s === 'soon' ? 2 : 3
    }
    return [...list].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name)
      if (sort === 'status') return a.status.localeCompare(b.status)
      if (sort === 'dwell') return dwellDays(b) - dwellDays(a)
      return dueRank(a.id) - dueRank(b.id) || dwellDays(b) - dwellDays(a)
    })
  }, [state, query, sort])

  return (
    <section className="manager" aria-label="Manager dashboard">
      <div className="kpis">
        <Kpi label="On site" value={kpis.total} />
        <Kpi label="Ready" value={kpis.ready} tone="good" />
        <Kpi label="Overdue" value={kpis.overdue} tone={kpis.overdue ? 'bad' : undefined} />
        <Kpi label="Due ≤3d" value={kpis.dueSoon} tone={kpis.dueSoon ? 'warn' : undefined} />
        <Kpi label="Blocked" value={kpis.blocked} tone={kpis.blocked ? 'bad' : undefined} />
        <Kpi label="Avg days" value={kpis.avgDwell} />
      </div>

      <div className="job-controls">
        <input
          type="search"
          placeholder="Search jobs…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search jobs"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Sort jobs"
        >
          <option value="due">Sort: due</option>
          <option value="dwell">Sort: days on site</option>
          <option value="status">Sort: status</option>
          <option value="name">Sort: name</option>
        </select>
      </div>

      <ul className="job-list">
        {jobs.map((j) => {
          const ds = dueState(j)
          return (
            <li
              key={j.id}
              className={`job-row ${j.id === selectedId ? 'selected' : ''}`}
              onClick={() => onSelect(j.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(j.id)
                }
              }}
              tabIndex={0}
              role="button"
            >
              <span className="job-dot" style={{ background: STATUS_COLORS[j.status] }} />
              <span className="job-name">{j.name}</span>
              {(j.tags ?? []).slice(0, 2).map((t) => (
                <button
                  key={t}
                  className="job-tag"
                  style={{ background: tagColor(t) }}
                  onClick={(e) => {
                    e.stopPropagation()
                    setQuery(t)
                  }}
                  title={`Filter by ${t}`}
                >
                  {t}
                </button>
              ))}
              <span className="job-dwell">{dwellDays(j)}d</span>
              {j.dueDate && <span className={`job-due due-${ds}`}>{dueLabel(j)}</span>}
            </li>
          )
        })}
        {jobs.length === 0 && <li className="muted job-empty">No matching jobs.</li>}
      </ul>

      {loads.length > 0 && (
        <div className="sheds">
          <h4>Capacity</h4>
          {loads.map((l) => (
            <div key={l.zone.id} className="shed-row">
              <span className="shed-name">{l.zone.name}</span>
              <span className="shed-count">{l.count}</span>
              <span className={`shed-bar ${l.over ? 'over' : ''}`}>
                <span style={{ width: `${Math.min(100, Math.round(l.fill * 100))}%` }} />
              </span>
              {l.over && <span className="shed-warn" title="Over capacity">⚠</span>}
            </div>
          ))}
        </div>
      )}

      {history.length > 0 && (
        <div className="timeline">
          <h4>Activity</h4>
          <ul>
            {history.slice(0, 12).map((e) => (
              <li key={e.id} className={`tl tl-${e.kind}`}>
                <span className="tl-time">{timeAgo(e.at)}</span>
                <span>{e.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: 'good' | 'warn' | 'bad' }) {
  return (
    <div className={`kpi ${tone ? `kpi-${tone}` : ''}`}>
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
    </div>
  )
}

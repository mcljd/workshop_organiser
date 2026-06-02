import { useRef } from 'react'
import type { ItemStatus } from '../types'
import { STATUS_COLORS, STATUS_LABELS } from '../types'

interface Props {
  workshopName: string
  onRename: (name: string) => void
  onAddItem: () => void
  onUploadFloorPlan: (dataUrl: string) => void
  onClearFloorPlan: () => void
  hasFloorPlan: boolean
  onExport: () => void
  onImport: (text: string) => void
  counts: Record<ItemStatus, number>
  total: number
}

/** Top bar: workshop name plus the main actions. */
export function Toolbar({
  workshopName,
  onRename,
  onAddItem,
  onUploadFloorPlan,
  onClearFloorPlan,
  hasFloorPlan,
  onExport,
  onImport,
  counts,
  total,
}: Props) {
  const planInput = useRef<HTMLInputElement | null>(null)
  const importInput = useRef<HTMLInputElement | null>(null)

  function handlePlanFile(file: File | undefined) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => onUploadFloorPlan(String(reader.result))
    reader.readAsDataURL(file)
  }

  function handleImportFile(file: File | undefined) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => onImport(String(reader.result))
    reader.readAsText(file)
  }

  return (
    <header className="toolbar">
      <div className="brand">
        <span className="logo" aria-hidden>
          ▦
        </span>
        <input
          className="workshop-name"
          value={workshopName}
          onChange={(e) => onRename(e.target.value)}
          aria-label="Workshop name"
        />
      </div>

      <div className="summary" title={`${total} item${total === 1 ? '' : 's'}`}>
        {(Object.keys(STATUS_LABELS) as ItemStatus[]).map((s) => (
          <span key={s} className="summary-chip">
            <span className="swatch" style={{ background: STATUS_COLORS[s] }} />
            {counts[s]} {STATUS_LABELS[s]}
          </span>
        ))}
      </div>

      <div className="actions">
        <button onClick={onAddItem}>+ Add boat</button>

        <button onClick={() => planInput.current?.click()}>
          {hasFloorPlan ? 'Replace floor plan' : 'Upload floor plan'}
        </button>
        {hasFloorPlan && (
          <button className="ghost" onClick={onClearFloorPlan}>
            Remove plan
          </button>
        )}

        <span className="divider" />

        <button className="ghost" onClick={onExport}>
          Export
        </button>
        <button className="ghost" onClick={() => importInput.current?.click()}>
          Import
        </button>
      </div>

      <input
        ref={planInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          handlePlanFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <input
        ref={importInput}
        type="file"
        accept="application/json"
        hidden
        onChange={(e) => {
          handleImportFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </header>
  )
}

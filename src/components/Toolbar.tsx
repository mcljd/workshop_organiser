import { useRef } from 'react'
import type { ItemStatus } from '../types'
import { STATUS_COLORS, STATUS_LABELS } from '../types'
import { SCENARIOS } from '../scenarios'

interface Props {
  workshopName: string
  onRename: (name: string) => void
  onAddItem: () => void
  onLoadScenario: (key: string) => void
  onNewFromSpace: () => void
  onScanAerial: (dataUrl: string) => void
  onFindObjects: (dataUrl: string) => void
  onEditZones: () => void
  onDetect: () => void
  hasPlan: boolean
  onExport: () => void
  onImport: (text: string) => void
  counts: Record<ItemStatus, number>
}

/** Top bar: brand, workshop name, demo switcher, and the main actions. */
export function Toolbar({
  workshopName,
  onRename,
  onAddItem,
  onLoadScenario,
  onNewFromSpace,
  onScanAerial,
  onFindObjects,
  onEditZones,
  onDetect,
  hasPlan,
  onExport,
  onImport,
  counts,
}: Props) {
  const importInput = useRef<HTMLInputElement | null>(null)
  const aerialInput = useRef<HTMLInputElement | null>(null)
  const phoneInput = useRef<HTMLInputElement | null>(null)
  const objectsInput = useRef<HTMLInputElement | null>(null)

  function readImage(file: File | undefined, cb: (dataUrl: string) => void) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => cb(String(reader.result))
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
          ◳
        </span>
        <div className="brand-text">
          <input
            className="workshop-name"
            value={workshopName}
            onChange={(e) => onRename(e.target.value)}
            aria-label="Workshop name"
          />
          <span className="brand-sub">Workshop Organiser · live demo</span>
        </div>
      </div>

      <div className="summary">
        {(Object.keys(STATUS_LABELS) as ItemStatus[]).map((s) => (
          <span key={s} className="summary-chip">
            <span className="swatch" style={{ background: STATUS_COLORS[s] }} />
            {counts[s]} {STATUS_LABELS[s]}
          </span>
        ))}
      </div>

      <div className="actions">
        <label className="scenario-select">
          <span>Demo</span>
          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) onLoadScenario(e.target.value)
              e.target.value = ''
            }}
          >
            <option value="" disabled>
              Load…
            </option>
            {SCENARIOS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <button onClick={onAddItem} aria-label="Add a new item to the floor">
          + Add item
        </button>
        <button className="ghost" onClick={onEditZones} title="Draw, move, rename sheds and areas">
          ✏️ Edit sheds
        </button>
        <button className="accent" onClick={onNewFromSpace}>
          ✦ Build from my space
        </button>
        <button className="ghost" onClick={() => aerialInput.current?.click()} title="Detect buildings from an aerial/satellite image">
          🛰 Scan aerial
        </button>
        <button className="ghost" onClick={() => phoneInput.current?.click()} title="Take an overhead photo from a high spot and detect the buildings">
          📷 Scan (phone)
        </button>
        <button className="ghost" onClick={() => objectsInput.current?.click()} title="Use the AI model to find boats and vehicles in a photo">
          🧠 Find objects
        </button>
        {hasPlan && (
          <button className="ghost" onClick={onDetect} title="Re-read the floor plan and add detected doors and objects">
            ⌖ Re-read plan
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
        ref={importInput}
        type="file"
        accept="application/json"
        hidden
        onChange={(e) => {
          handleImportFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <input
        ref={aerialInput}
        type="file"
        hidden
        onChange={(e) => {
          readImage(e.target.files?.[0], onScanAerial)
          e.target.value = ''
        }}
      />
      <input
        ref={phoneInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          readImage(e.target.files?.[0], onScanAerial)
          e.target.value = ''
        }}
      />
      <input
        ref={objectsInput}
        type="file"
        hidden
        onChange={(e) => {
          readImage(e.target.files?.[0], onFindObjects)
          e.target.value = ''
        }}
      />
    </header>
  )
}

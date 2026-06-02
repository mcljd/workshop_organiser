import { useRef, useState } from 'react'
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
  onSmartFind: () => void
  onSmartScan: () => void
  onScanEverything: () => void
  onEditZones: () => void
  onReadLabels: () => void
  onDetect: () => void
  hasPlan: boolean
  onExport: () => void
  onImport: (text: string) => void
  onImportImage: (dataUrl: string) => void
  counts: Record<ItemStatus, number>
  liveId: string | null
  onGoLive: () => void
  onCopyLink: () => void
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
  onSmartFind,
  onSmartScan,
  onScanEverything,
  onEditZones,
  onReadLabels,
  onDetect,
  hasPlan,
  onExport,
  onImport,
  onImportImage,
  counts,
  liveId,
  onGoLive,
  onCopyLink,
}: Props) {
  const [copied, setCopied] = useState(false)
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
    // An image? Treat it as a floor plan and read it. Otherwise import as a
    // saved Yardly layout (JSON).
    if (file.type.startsWith('image/')) {
      reader.onload = () => onImportImage(String(reader.result))
      reader.readAsDataURL(file)
    } else {
      reader.onload = () => onImport(String(reader.result))
      reader.readAsText(file)
    }
  }

  return (
    <header className="toolbar">
      <div className="brand">
        <span className="logo" aria-hidden>
          Y
        </span>
        <div className="brand-text">
          <span className="brand-name">
            Yardly
            {liveId && <span className="brand-live" title="This site is live"> ● live</span>}
          </span>
          <input
            className="workshop-name"
            value={workshopName}
            onChange={(e) => onRename(e.target.value)}
            aria-label="Site name"
          />
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
        <button className="accent" onClick={onScanEverything} title="One overhead photo → buildings + objects, reviewed by you">
          ✨ Scan everything
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
        <button className="ghost" onClick={onSmartFind} title="Type what to look for — a zero-shot AI model finds it in a photo">
          🔎 Smart find
        </button>
        <button className="ghost" onClick={onSmartScan} title="Detect buildings by name in an aerial photo, then review">
          🛰 Smart scan
        </button>
        {hasPlan && (
          <button className="ghost" onClick={onDetect} title="Re-read the floor plan and add detected doors and objects">
            ⌖ Re-read plan
          </button>
        )}
        {hasPlan && (
          <button className="ghost" onClick={onReadLabels} title="Read the text labels on the plan and name items from the drawing">
            🔤 Read labels
          </button>
        )}

        <span className="divider" />

        {liveId ? (
          <button
            className="live-btn"
            onClick={() => {
              onCopyLink()
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }}
            title="This site is live — share this link"
          >
            <span className="live-dot" /> {copied ? 'Link copied!' : 'LIVE · Copy link'}
          </button>
        ) : (
          <button className="accent" onClick={onGoLive} title="Publish a live, shareable link that updates in real time">
            ⚡ Go live
          </button>
        )}

        <button className="ghost" onClick={onExport}>
          Export
        </button>
        <button
          className="ghost"
          onClick={() => importInput.current?.click()}
          title="Open a saved Yardly layout (.json) or a floor-plan image"
        >
          Open / Import
        </button>
      </div>

      <input
        ref={importInput}
        type="file"
        hidden
        onChange={(e) => {
          handleImportFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <input
        ref={aerialInput}
        type="file"
        accept="image/*"
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
        accept="image/*"
        hidden
        onChange={(e) => {
          readImage(e.target.files?.[0], onFindObjects)
          e.target.value = ''
        }}
      />
    </header>
  )
}

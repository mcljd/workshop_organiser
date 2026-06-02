import { useRef } from 'react'

interface Props {
  workshopName: string
  onRename: (name: string) => void
  onAddItem: () => void
  onUploadFloorPlan: (dataUrl: string) => void
  onClearFloorPlan: () => void
  hasFloorPlan: boolean
  onExport: () => void
  onImport: (text: string) => void
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

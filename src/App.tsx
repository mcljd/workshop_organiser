import { useEffect, useMemo, useState } from 'react'
import { FloorCanvas } from './components/FloorCanvas'
import { Sidebar } from './components/Sidebar'
import { Toolbar } from './components/Toolbar'
import type { FloorItem, WorkshopState } from './types'
import {
  createDefaultState,
  exportState,
  loadState,
  newId,
  parseImportedState,
  saveState,
} from './storage'

export default function App() {
  const [state, setState] = useState<WorkshopState>(() => loadState())
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Auto-save on every change (debounced a touch to avoid thrashing storage).
  useEffect(() => {
    const t = setTimeout(() => saveState(state), 300)
    return () => clearTimeout(t)
  }, [state])

  const selectedItem = useMemo(
    () => state.items.find((i) => i.id === selectedId) ?? null,
    [state.items, selectedId],
  )

  function addItem() {
    const item: FloorItem = {
      id: newId(),
      name: `Boat ${state.items.length + 1}`,
      // Drop new items near the top-left of the floor.
      x: state.floor.width * 0.2,
      y: state.floor.height * 0.2,
      width: 180,
      height: 70,
      rotation: 0,
      status: 'incoming',
    }
    setState((s) => ({ ...s, items: [...s.items, item] }))
    setSelectedId(item.id)
  }

  function moveItem(id: string, x: number, y: number) {
    setState((s) => ({
      ...s,
      items: s.items.map((i) => (i.id === id ? { ...i, x, y } : i)),
    }))
  }

  function patchSelected(patch: Partial<FloorItem>) {
    if (!selectedId) return
    setState((s) => ({
      ...s,
      items: s.items.map((i) => (i.id === selectedId ? { ...i, ...patch } : i)),
    }))
  }

  function deleteSelected() {
    if (!selectedId) return
    setState((s) => ({ ...s, items: s.items.filter((i) => i.id !== selectedId) }))
    setSelectedId(null)
  }

  function setFloorPlan(dataUrl: string | null) {
    setState((s) => ({ ...s, floor: { ...s.floor, imageDataUrl: dataUrl } }))
  }

  function importState(text: string) {
    const imported = parseImportedState(text)
    if (!imported) {
      alert('That file does not look like a valid workshop layout.')
      return
    }
    setState(imported)
    setSelectedId(null)
  }

  function resetAll() {
    if (confirm('Start a new, empty workshop? Your current layout will be cleared.')) {
      setState(createDefaultState())
      setSelectedId(null)
    }
  }

  return (
    <div className="app">
      <Toolbar
        workshopName={state.name}
        onRename={(name) => setState((s) => ({ ...s, name }))}
        onAddItem={addItem}
        onUploadFloorPlan={(dataUrl) => setFloorPlan(dataUrl)}
        onClearFloorPlan={() => setFloorPlan(null)}
        hasFloorPlan={!!state.floor.imageDataUrl}
        onExport={() => exportState(state)}
        onImport={importState}
      />

      <main className="workspace">
        <div className="canvas-wrap">
          <FloorCanvas
            floor={state.floor}
            items={state.items}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onMoveItem={moveItem}
          />
          <div className="canvas-hint">
            Drag items to move • Scroll to zoom • Drag empty space to pan
            <button className="link" onClick={resetAll}>
              New workshop
            </button>
          </div>
        </div>

        <Sidebar
          item={selectedItem}
          itemCount={state.items.length}
          onChange={patchSelected}
          onDelete={deleteSelected}
        />
      </main>
    </div>
  )
}

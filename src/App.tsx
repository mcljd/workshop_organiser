import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { Toolbar } from './components/Toolbar'
import { InsightsPanel } from './components/InsightsPanel'
import { ManagerPanel } from './components/ManagerPanel'
import { Onboarding } from './components/Onboarding'
import { analyse } from './analyse'
import { optimiseLayout } from './optimise'
import { analyzeFloorPlan } from './vision'
import { SCENARIOS } from './scenarios'
import type { FloorItem, ItemStatus, WorkshopState } from './types'
import {
  exportState,
  loadState,
  newId,
  parseImportedState,
  saveState,
} from './storage'

// The 3D engine (Three.js + R3F) is heavy, so load it on demand — the toolbar,
// panel and wizard render immediately while it streams in.
const Scene3D = lazy(() =>
  import('./components/Scene3D').then((m) => ({ default: m.Scene3D })),
)

const SEEN_KEY = 'workshop-organiser:onboarded'

export default function App() {
  const [state, setState] = useState<WorkshopState>(() => loadState())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showWizard, setShowWizard] = useState(() => !localStorage.getItem(SEEN_KEY))

  // Auto-save on every change (debounced a touch to avoid thrashing storage).
  useEffect(() => {
    const t = setTimeout(() => saveState(state), 300)
    return () => clearTimeout(t)
  }, [state])

  // Keyboard: Delete removes the selected item, Escape deselects, arrow keys
  // nudge it (Shift = larger steps) — so the floor is usable without a mouse.
  useEffect(() => {
    const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        setState((s) => ({ ...s, items: s.items.filter((i) => i.id !== selectedId) }))
        setSelectedId(null)
      } else if (e.key === 'Escape') {
        setSelectedId(null)
      } else if (selectedId && ARROWS.includes(e.key)) {
        e.preventDefault()
        const step = e.shiftKey ? 50 : 10
        setState((s) => ({
          ...s,
          items: s.items.map((i) => {
            if (i.id !== selectedId) return i
            let { x, y } = i
            if (e.key === 'ArrowUp') y -= step
            if (e.key === 'ArrowDown') y += step
            if (e.key === 'ArrowLeft') x -= step
            if (e.key === 'ArrowRight') x += step
            return {
              ...i,
              x: Math.max(0, Math.min(s.floor.width, x)),
              y: Math.max(0, Math.min(s.floor.height, y)),
            }
          }),
        }))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId])

  const selectedItem = useMemo(
    () => state.items.find((i) => i.id === selectedId) ?? null,
    [state.items, selectedId],
  )

  const analysis = useMemo(() => analyse(state), [state])

  const counts = useMemo(() => {
    const base: Record<ItemStatus, number> = {
      incoming: 0,
      in_progress: 0,
      ready: 0,
      blocked: 0,
    }
    for (const item of state.items) base[item.status]++
    return base
  }, [state.items])

  function addItem() {
    const isBoat = state.items.some((i) => i.shape === 'boat')
    const item: FloorItem = {
      id: newId(),
      name: `${isBoat ? 'Boat' : 'Item'} ${state.items.length + 1}`,
      x: state.floor.width * 0.5,
      y: state.floor.height * 0.5,
      width: isBoat ? 200 : 150,
      height: isBoat ? 78 : 90,
      rotation: 0,
      status: 'incoming',
      shape: isBoat ? 'boat' : 'box',
      arrivedAt: new Date().toISOString(),
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

  function loadScenario(key: string) {
    const scenario = SCENARIOS.find((s) => s.key === key)
    if (!scenario) return
    setState(scenario.build())
    setSelectedId(null)
  }

  async function detectFromPlan() {
    const img = state.floor.imageDataUrl
    if (!img) return
    const det = await analyzeFloorPlan(img)
    // Scale detection (sized to its own aspect) onto the current floor.
    const sx = state.floor.width / det.floorWidth
    const sy = state.floor.height / det.floorHeight
    const found = det.items.map((it) => ({
      ...it,
      id: newId(),
      x: it.x * sx,
      y: it.y * sy,
      width: it.width * sx,
      height: it.height * sy,
    }))
    // Replace any previously-detected doors so repeated reads don't stack them.
    setState((s) => ({
      ...s,
      items: [...s.items.filter((i) => i.shape !== 'door'), ...found],
    }))
    if (det.summary.doors + det.summary.objects === 0) {
      alert('No clear doors or objects found in this image. A line floor plan works best.')
    }
  }

  function optimise() {
    const targets = optimiseLayout(state)
    if (targets.size === 0) return
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const apply = (e: number) =>
      setState((s) => ({
        ...s,
        items: s.items.map((i) => {
          const tg = targets.get(i.id)
          const fr = from.get(i.id)
          if (!tg || !fr) return i
          return { ...i, x: fr.x + (tg.x - fr.x) * e, y: fr.y + (tg.y - fr.y) * e }
        }),
      }))
    const from = new Map(state.items.map((i) => [i.id, { x: i.x, y: i.y }]))
    if (reduce) {
      apply(1)
      return
    }
    const start = performance.now()
    const dur = 700
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / dur)
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2 // easeInOutQuad
      apply(e)
      if (k < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
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

  function finishWizard(built: WorkshopState) {
    localStorage.setItem(SEEN_KEY, '1')
    setState(built)
    setSelectedId(null)
    setShowWizard(false)
  }

  function closeWizard() {
    localStorage.setItem(SEEN_KEY, '1')
    setShowWizard(false)
  }

  return (
    <div className="app">
      <Toolbar
        workshopName={state.name}
        onRename={(name) => setState((s) => ({ ...s, name }))}
        onAddItem={addItem}
        onLoadScenario={loadScenario}
        onNewFromSpace={() => setShowWizard(true)}
        onDetect={detectFromPlan}
        hasPlan={!!state.floor.imageDataUrl}
        onExport={() => exportState(state)}
        onImport={importState}
        counts={counts}
      />

      <main className="workspace">
        <div
          className="canvas-wrap"
          role="application"
          aria-label="Interactive 3D workshop floor. Drag items to move them; use the side panel and arrow keys to edit."
        >
          <Suspense
            fallback={
              <div className="canvas-loading">Loading 3D workshop…</div>
            }
          >
            <Scene3D
              floor={state.floor}
              zones={state.zones}
              items={state.items}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onMoveItem={moveItem}
            />
          </Suspense>
          <div className="canvas-hint">
            Drag items to move • Drag empty space to orbit • Scroll to zoom • Del to remove
          </div>
        </div>

        <aside className="panel">
          <ManagerPanel state={state} selectedId={selectedId} onSelect={setSelectedId} />
          <div className="panel-divider" />
          <InsightsPanel analysis={analysis} onSelectItem={setSelectedId} onOptimise={optimise} />
          <div className="panel-divider" />
          <h3 className="panel-h">Details</h3>
          <Sidebar
            item={selectedItem}
            itemCount={state.items.length}
            onChange={patchSelected}
            onDelete={deleteSelected}
          />
        </aside>
      </main>

      {showWizard && <Onboarding onClose={closeWizard} onBuild={finishWizard} />}
    </div>
  )
}

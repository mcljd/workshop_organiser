import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { Toolbar } from './components/Toolbar'
import { InsightsPanel } from './components/InsightsPanel'
import { ManagerPanel } from './components/ManagerPanel'
import { Onboarding } from './components/Onboarding'
import { BuildingReview } from './components/BuildingReview'
import { ZoneEditor } from './components/ZoneEditor'
import { AddItemDialog } from './components/AddItemDialog'
import { SmartFindDialog } from './components/SmartFindDialog'
import { smartFind } from './smartFind'
import { analyse } from './analyse'
import { optimiseLayout } from './optimise'
import { analyzeFloorPlan } from './vision'
import { detectBuildings, recordFeedback, type Building, type BuildingScan } from './buildings'
import { detectObjectsInPhoto } from './objectModel'
import { SCENARIOS } from './scenarios'
import type { FloorItem, ItemStatus, MoveKind, WorkshopState } from './types'
import { STATUS_LABELS } from './types'
import { allTags as collectTags, zoneOf } from './manager'
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
  const [scan, setScan] = useState<BuildingScan | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [showZones, setShowZones] = useState(false)
  const [smartMode, setSmartMode] = useState<'objects' | 'buildings' | null>(null)
  const [aiBusy, setAiBusy] = useState<string | null>(null)

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
  const tagList = useMemo(() => collectTags(state), [state])

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

  function addBySize(item: FloorItem, metresWide: number) {
    setState((s) => ({
      ...s,
      floor: { ...s.floor, metresWide },
      items: [...s.items, item],
    }))
    setSelectedId(item.id)
    setShowAdd(false)
    logEvent('add', `Added ${item.name}`)
  }

  // --- Aerial scan: detect buildings, then let the user review/correct. ---
  async function scanAerial(dataUrl: string) {
    setAiBusy('Scanning for buildings…')
    try {
      setScan(await detectBuildings(dataUrl))
    } finally {
      setAiBusy(null)
    }
  }

  // --- AI model: detect boats/vehicles in a photo and drop them on the floor. ---
  async function findObjectsAI(dataUrl: string) {
    setAiBusy('Loading AI model & finding objects…')
    try {
      const res = await detectObjectsInPhoto(dataUrl)
      if (res.objects.length === 0) {
        alert('The AI model ran but found no boats or vehicles in this photo.')
        return
      }
      const { width: FW, height: FH } = state.floor
      const now = new Date().toISOString()
      const found = res.objects.map((o) => ({
        id: newId(),
        name: o.name,
        x: o.cx * FW,
        y: o.cy * FH,
        width: Math.max(40, o.w * FW),
        height: Math.max(28, o.h * FH),
        rotation: 0,
        status: 'incoming' as const,
        shape: o.shape,
        arrivedAt: now,
      }))
      setState((s) => ({ ...s, items: [...s.items, ...found] }))
    } catch {
      alert(
        'Could not load the AI model. It downloads on first use, so this needs an internet connection.',
      )
    } finally {
      setAiBusy(null)
    }
  }

  const SHED_COLORS = [
    '#6366f1',
    '#14b8a6',
    '#f97316',
    '#a855f7',
    '#0ea5e9',
    '#22c55e',
    '#ef4444',
    '#64748b',
  ]

  async function confirmScan(buildings: Building[], metresWide: number, alsoObjects: boolean) {
    if (!scan) return
    recordFeedback(buildings) // learn from keeps vs drops
    const imageDataUrl = scan.imageDataUrl
    const aspect = scan.aspect
    const FW = 1200
    const FH = Math.round(FW / aspect)
    const kept = buildings.filter((b) => b.keep)
    const zones = kept.map((b, i) => ({
      id: newId(),
      name: b.name,
      x: b.x * FW,
      y: b.y * FH,
      width: b.w * FW,
      height: b.h * FH,
      color: SHED_COLORS[i % SHED_COLORS.length],
    }))
    setScan(null)
    setSelectedId(null)

    // Optionally run the AI model on the same overhead shot to place objects.
    let items: FloorItem[] = []
    if (alsoObjects) {
      setAiBusy('Finding boats & vehicles in the photo…')
      try {
        const res = await detectObjectsInPhoto(imageDataUrl)
        const now = new Date().toISOString()
        items = res.objects.map((o) => ({
          id: newId(),
          name: o.name,
          x: o.cx * FW,
          y: o.cy * FH,
          width: Math.max(40, o.w * FW),
          height: Math.max(28, o.h * FH),
          rotation: 0,
          status: 'incoming' as const,
          shape: o.shape,
          arrivedAt: now,
        }))
      } catch {
        alert('Buildings added, but the object model could not load (needs internet on first use).')
      } finally {
        setAiBusy(null)
      }
    }

    const summary = `Scanned site — ${zones.length} building${zones.length === 1 ? '' : 's'}${
      items.length ? `, ${items.length} object${items.length === 1 ? '' : 's'}` : ''
    }`
    setState((s) => ({
      ...s,
      floor: { imageDataUrl, width: FW, height: FH, metresWide },
      zones,
      items,
      history: [{ id: newId(), at: new Date().toISOString(), kind: 'scan', text: summary }],
    }))
    // Drop straight into the shed editor so they can tidy areas before adding items.
    setShowZones(true)
  }

  function logEvent(kind: MoveKind, text: string) {
    setState((s) => ({
      ...s,
      history: [
        { id: newId(), at: new Date().toISOString(), kind, text },
        ...(s.history ?? []),
      ].slice(0, 60),
    }))
  }

  function moveEnd(id: string) {
    const it = state.items.find((i) => i.id === id)
    if (!it) return
    const z = zoneOf(it, state.zones)
    logEvent('move', z ? `Moved ${it.name} into ${z.name}` : `Moved ${it.name}`)
  }

  function moveItem(id: string, x: number, y: number) {
    setState((s) => ({
      ...s,
      items: s.items.map((i) => (i.id === id ? { ...i, x, y } : i)),
    }))
  }

  function patchSelected(patch: Partial<FloorItem>) {
    if (!selectedId) return
    const prev = state.items.find((i) => i.id === selectedId)
    setState((s) => ({
      ...s,
      items: s.items.map((i) => (i.id === selectedId ? { ...i, ...patch } : i)),
    }))
    if (prev && patch.status && patch.status !== prev.status) {
      logEvent('status', `${prev.name}: ${STATUS_LABELS[prev.status]} → ${STATUS_LABELS[patch.status]}`)
    }
  }

  function deleteSelected() {
    if (!selectedId) return
    const name = state.items.find((i) => i.id === selectedId)?.name ?? 'item'
    setState((s) => ({ ...s, items: s.items.filter((i) => i.id !== selectedId) }))
    setSelectedId(null)
    logEvent('remove', `Removed ${name}`)
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
    logEvent('optimise', 'Optimised layout')
  }

  // Smart find for buildings: detect named structures, then route through the
  // same review/correct/learn screen as the classical scanner.
  async function runSmartScan(dataUrl: string, labels: string[]) {
    setSmartMode(null)
    setAiBusy('Loading smart model & finding buildings… (first run downloads it)')
    try {
      const res = await smartFind(dataUrl, labels)
      const buildings = res.objects
        .map((o, i) => ({
          id: `s${i}`,
          x: Math.max(0, o.cx - o.w / 2),
          y: Math.max(0, o.cy - o.h / 2),
          w: o.w,
          h: o.h,
          score: o.score,
          name: o.label.replace(/^./, (c) => c.toUpperCase()),
          keep: o.score >= 0.2,
        }))
        .sort((a, b) => b.score - a.score)
      if (buildings.length === 0) {
        alert('The model found no matching structures. Try words like "shed, building, warehouse".')
        return
      }
      setScan({ imageDataUrl: dataUrl, aspect: res.aspect, buildings })
    } catch {
      alert('Could not load the smart model. It downloads on first use, so this needs internet.')
    } finally {
      setAiBusy(null)
    }
  }

  async function runSmartFind(dataUrl: string, labels: string[]) {
    setSmartMode(null)
    setAiBusy('Loading smart model & searching… (first run downloads it)')
    try {
      const res = await smartFind(dataUrl, labels)
      if (res.objects.length === 0) {
        alert('The model ran but found none of those things in the photo. Try different words.')
        return
      }
      const { width: FW, height: FH } = state.floor
      const now = new Date().toISOString()
      const found = res.objects.map((o) => ({
        id: newId(),
        name: o.label.replace(/^./, (c) => c.toUpperCase()),
        x: o.cx * FW,
        y: o.cy * FH,
        width: Math.max(40, o.w * FW),
        height: Math.max(28, o.h * FH),
        rotation: 0,
        status: 'incoming' as const,
        shape: o.shape,
        arrivedAt: now,
      }))
      setState((s) => ({ ...s, items: [...s.items, ...found] }))
      logEvent('scan', `Smart find added ${found.length} item${found.length === 1 ? '' : 's'}`)
    } catch {
      alert('Could not load the smart model. It downloads on first use, so this needs internet.')
    } finally {
      setAiBusy(null)
    }
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
        onAddItem={() => setShowAdd(true)}
        onLoadScenario={loadScenario}
        onNewFromSpace={() => setShowWizard(true)}
        onScanAerial={scanAerial}
        onFindObjects={findObjectsAI}
        onSmartFind={() => setSmartMode('objects')}
        onSmartScan={() => setSmartMode('buildings')}
        onEditZones={() => setShowZones(true)}
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
              onMoveEnd={moveEnd}
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
            allTags={tagList}
            onChange={patchSelected}
            onDelete={deleteSelected}
          />
        </aside>
      </main>

      {aiBusy && (
        <div className="ai-busy" role="status" aria-live="assertive">
          <div className="spinner" />
          <span>{aiBusy}</span>
        </div>
      )}
      {showWizard && <Onboarding onClose={closeWizard} onBuild={finishWizard} />}
      {scan && (
        <BuildingReview scan={scan} onConfirm={confirmScan} onCancel={() => setScan(null)} />
      )}
      {showZones && (
        <ZoneEditor
          floor={state.floor}
          zones={state.zones}
          onDone={(zones) => {
            setState((s) => ({ ...s, zones }))
            setShowZones(false)
            logEvent('edit', `Edited sheds & areas (${zones.length})`)
          }}
          onCancel={() => setShowZones(false)}
        />
      )}
      {showAdd && (
        <AddItemDialog
          floor={state.floor}
          zones={state.zones}
          onAdd={addBySize}
          onClose={() => setShowAdd(false)}
        />
      )}
      {smartMode === 'objects' && (
        <SmartFindDialog onRun={runSmartFind} onClose={() => setSmartMode(null)} />
      )}
      {smartMode === 'buildings' && (
        <SmartFindDialog
          title="Find buildings by name"
          lead="Pick an aerial/overhead photo and type the structures to look for. The on-device AI detects them, then you review and correct — and it learns from your edits."
          defaultLabels="shed, building, warehouse, unit"
          suggested={['shed', 'building', 'warehouse', 'unit', 'hangar', 'workshop', 'marquee']}
          onRun={runSmartScan}
          onClose={() => setSmartMode(null)}
        />
      )}
    </div>
  )
}

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import {
  createSite,
  loadSite,
  saveSite,
  siteIdFromUrl,
  subscribeSite,
  unsubscribe,
} from './cloud'
import { Sidebar } from './components/Sidebar'
import { Toolbar } from './components/Toolbar'
import { InsightsPanel } from './components/InsightsPanel'
import { ManagerPanel } from './components/ManagerPanel'
import { Onboarding } from './components/Onboarding'
import { BuildingReview } from './components/BuildingReview'
import { ZoneEditor } from './components/ZoneEditor'
import { AddItemDialog } from './components/AddItemDialog'
import { SmartFindDialog } from './components/SmartFindDialog'
import { smartFind, type FoundObject } from './smartFind'
import { analyse } from './analyse'
import { optimiseLayout } from './optimise'
import { analyzeFloorPlan } from './vision'
import { detectBuildings, recordFeedback, type Building, type BuildingScan } from './buildings'
import { detectObjectsInPhoto } from './objectModel'
import { readLabels } from './ocr'
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

// Saved label sets so Smart find/scan is one tap per industry.
const OBJECT_PRESETS = [
  {
    name: 'Boatyard',
    labels: 'boat, rib, pontoon boat, jet ski, kayak, dinghy, outboard engine, boat trailer, forklift',
  },
  { name: 'Marina', labels: 'boat, yacht, rib, dinghy, jet ski, pontoon, cradle' },
  { name: 'Car lot', labels: 'car, van, truck, trailer, caravan' },
  { name: 'Plant hire', labels: 'excavator, forklift, generator, shipping container, trailer, digger' },
  { name: 'Warehouse', labels: 'pallet, forklift, truck, shipping container, crate' },
]
const BUILDING_PRESETS = [
  { name: 'Sheds', labels: 'shed, building, unit' },
  { name: 'Warehouse', labels: 'warehouse, building, unit' },
  { name: 'Mixed site', labels: 'shed, building, warehouse, hangar, marquee' },
]
const STRUCTURE_LABELS = ['shed', 'building', 'warehouse', 'unit', 'hangar']

export default function App() {
  const [state, setState] = useState<WorkshopState>(() => loadState())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showWizard, setShowWizard] = useState(() => !localStorage.getItem(SEEN_KEY))
  const [scan, setScan] = useState<BuildingScan | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [showZones, setShowZones] = useState(false)
  const [smartMode, setSmartMode] = useState<'objects' | 'buildings' | 'everything' | null>(null)
  const [pendingObjects, setPendingObjects] = useState<FoundObject[]>([])
  const [aiBusy, setAiBusy] = useState<string | null>(null)
  const [liveId, setLiveId] = useState<string | null>(null)
  const applyingRemote = useRef(false)
  const suppressEcho = useRef(0)
  const liveChannel = useRef<ReturnType<typeof subscribeSite> | null>(null)

  // Auto-save on every change (debounced). Also push to the cloud when live —
  // unless this change came *from* a remote update (avoids an echo loop).
  useEffect(() => {
    const t = setTimeout(() => {
      saveState(state)
      if (liveId && !applyingRemote.current) {
        suppressEcho.current = Date.now() + 1500
        saveSite(liveId, state).catch(() => {})
      }
      applyingRemote.current = false
    }, 300)
    return () => clearTimeout(t)
  }, [state, liveId])

  // On load, if the URL points at a live site, join it and stream updates.
  useEffect(() => {
    const id = siteIdFromUrl()
    if (!id) return
    let channel: ReturnType<typeof subscribeSite> | null = null
    ;(async () => {
      const remote = await loadSite(id)
      if (remote) {
        applyingRemote.current = true
        setState(remote)
        setLiveId(id)
        setShowWizard(false)
        channel = subscribeSite(id, (s) => {
          if (Date.now() < suppressEcho.current) return // our own echo
          applyingRemote.current = true
          setState(s)
        })
      }
    })()
    return () => {
      if (channel) unsubscribe(channel)
    }
  }, [])

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
    const now0 = new Date().toISOString()

    // Objects already found by "Scan everything" land in the kept sheds.
    let items: FloorItem[] = pendingObjects.map((o) => ({
      id: newId(),
      name: o.label.replace(/^./, (c) => c.toUpperCase()),
      x: o.cx * FW,
      y: o.cy * FH,
      width: Math.max(40, o.w * FW),
      height: Math.max(28, o.h * FH),
      rotation: 0,
      status: 'incoming' as const,
      shape: o.shape,
      arrivedAt: now0,
    }))
    setPendingObjects([])

    // Optionally also run the COCO model on the same overhead shot.
    if (alsoObjects) {
      setAiBusy('Finding boats & vehicles in the photo…')
      try {
        const res = await detectObjectsInPhoto(imageDataUrl)
        const now = new Date().toISOString()
        items = [
          ...items,
          ...res.objects.map((o) => ({
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
          })),
        ]
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

  // OCR: read the text labels on the current floor plan and name items from
  // the drawing itself (free, on-device).
  async function readPlanLabels() {
    const img = state.floor.imageDataUrl
    if (!img) {
      alert('Open or scan a floor plan first, then read its labels.')
      return
    }
    setAiBusy('Reading the text on your plan… (first run downloads the OCR engine)')
    try {
      const res = await readLabels(img)
      if (res.labels.length === 0) {
        alert('No clear text labels were found on this image.')
        return
      }
      const { width: FW, height: FH, metresWide } = state.floor
      const unitsPer = metresWide ? FW / metresWide : 0
      const now = new Date().toISOString()
      const items: FloorItem[] = res.labels.map((l) => {
        const sized = unitsPer && l.lengthFt && l.widthFt
        return {
          id: newId(),
          name: l.text,
          x: l.cx * FW,
          y: l.cy * FH,
          width: sized ? Math.max(40, l.lengthFt! * unitsPer) : l.isBoat ? 180 : 110,
          height: sized ? Math.max(28, l.widthFt! * unitsPer) : l.isBoat ? 70 : 90,
          rotation: 0,
          status: 'incoming' as const,
          shape: l.isBoat ? ('boat' as const) : ('box' as const),
          notes: l.lengthFt && l.widthFt ? `${l.lengthFt}×${l.widthFt} (from plan)` : undefined,
          arrivedAt: now,
        }
      })
      setState((s) => ({ ...s, items: [...s.items, ...items] }))
      logEvent('scan', `Read ${items.length} label${items.length === 1 ? '' : 's'} from the plan`)
    } catch {
      alert('Could not load the OCR engine. It downloads on first use, so this needs internet.')
    } finally {
      setAiBusy(null)
    }
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
      setScan({ imageDataUrl: res.imageDataUrl, aspect: res.aspect, buildings })
    } catch {
      alert('Could not load the smart model. It downloads on first use, so this needs internet.')
    } finally {
      setAiBusy(null)
    }
  }

  // One overhead photo → buildings AND objects, both into the review screen.
  async function runScanEverything(dataUrl: string, objectLabels: string[]) {
    setSmartMode(null)
    setAiBusy('Finding buildings & objects… (first run downloads the model)')
    try {
      const bRes = await smartFind(dataUrl, STRUCTURE_LABELS)
      const buildings = bRes.objects
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
      // Run object detection on the same trimmed image so they align.
      const oRes = await smartFind(bRes.imageDataUrl, objectLabels)
      setPendingObjects(oRes.objects)
      if (buildings.length === 0 && oRes.objects.length === 0) {
        alert('The model found nothing matching. Try different words.')
        return
      }
      setScan({ imageDataUrl: bRes.imageDataUrl, aspect: bRes.aspect, buildings })
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

  async function goLive() {
    if (liveId) return
    setAiBusy('Creating your live site…')
    try {
      const id = await createSite(state)
      const url = new URL(window.location.href)
      url.searchParams.set('site', id)
      window.history.replaceState({}, '', url)
      setLiveId(id)
      liveChannel.current = subscribeSite(id, (s) => {
        if (Date.now() < suppressEcho.current) return
        applyingRemote.current = true
        setState(s)
      })
      logEvent('edit', 'Went live — sharing this site')
    } catch (e) {
      alert(`Could not create a live site: ${e instanceof Error ? e.message : 'unknown error'}`)
    } finally {
      setAiBusy(null)
    }
  }

  function copyLink() {
    navigator.clipboard?.writeText(window.location.href)
  }

  // Importing an image just reads it as a floor plan and builds the site.
  async function importImage(dataUrl: string) {
    setAiBusy('Reading your floor plan…')
    try {
      const det = await analyzeFloorPlan(dataUrl)
      setState((s) => ({
        ...s,
        floor: {
          imageDataUrl: det.imageDataUrl,
          width: det.floorWidth,
          height: det.floorHeight,
          metresWide: s.floor.metresWide,
        },
        zones: det.zones,
        items: det.items,
      }))
      setSelectedId(null)
      logEvent('scan', `Read floor plan — ${det.summary.doors} doors, ${det.summary.objects} objects`)
    } catch {
      alert('Could not read that image. Try a clearer floor-plan image.')
    } finally {
      setAiBusy(null)
    }
  }

  function importState(text: string) {
    const imported = parseImportedState(text)
    if (!imported) {
      alert(
        'That file is not a saved Yardly layout. To use a floor plan or photo, upload an image (PNG/JPG) — it’ll be read automatically.',
      )
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
        onScanEverything={() => setSmartMode('everything')}
        onEditZones={() => setShowZones(true)}
        onReadLabels={readPlanLabels}
        onDetect={detectFromPlan}
        hasPlan={!!state.floor.imageDataUrl}
        onExport={() => exportState(state)}
        onImport={importState}
        onImportImage={importImage}
        counts={counts}
        liveId={liveId}
        onGoLive={goLive}
        onCopyLink={copyLink}
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
        <SmartFindDialog presets={OBJECT_PRESETS} onRun={runSmartFind} onClose={() => setSmartMode(null)} />
      )}
      {smartMode === 'buildings' && (
        <SmartFindDialog
          title="Find buildings by name"
          lead="Pick an aerial/overhead photo and type the structures to look for. The on-device AI detects them, then you review and correct — and it learns from your edits."
          defaultLabels="shed, building, warehouse, unit"
          suggested={['shed', 'building', 'warehouse', 'unit', 'hangar', 'workshop', 'marquee']}
          presets={BUILDING_PRESETS}
          onRun={runSmartScan}
          onClose={() => setSmartMode(null)}
        />
      )}
      {smartMode === 'everything' && (
        <SmartFindDialog
          title="Scan everything"
          lead="Pick one overhead photo. The AI finds the buildings automatically, plus the objects you list below — all into the review screen. Buildings become sheds; objects land inside them."
          defaultLabels="boat, trailer, car, forklift"
          presets={OBJECT_PRESETS}
          onRun={runScanEverything}
          onClose={() => setSmartMode(null)}
        />
      )}
    </div>
  )
}

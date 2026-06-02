import type { WorkshopState } from './types'

const STORAGE_KEY = 'workshop-organiser:state'

export function createDefaultState(): WorkshopState {
  return {
    version: 1,
    name: 'My Workshop',
    floor: {
      imageDataUrl: null,
      width: 1200,
      height: 800,
    },
    items: [
      // A couple of starter items so the canvas isn't empty on first run.
      makeStarterItem('Boat 1', 200, 200, 'incoming'),
      makeStarterItem('Boat 2', 520, 300, 'in_progress'),
    ],
  }
}

function makeStarterItem(
  name: string,
  x: number,
  y: number,
  status: WorkshopState['items'][number]['status'],
): WorkshopState['items'][number] {
  return {
    id: newId(),
    name,
    x,
    y,
    width: 180,
    height: 70,
    rotation: 0,
    status,
  }
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export function loadState(): WorkshopState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createDefaultState()
    const parsed = JSON.parse(raw) as WorkshopState
    if (parsed && parsed.version === 1 && Array.isArray(parsed.items)) {
      return parsed
    }
  } catch {
    // Corrupt or incompatible saved data — fall back to a clean state.
  }
  return createDefaultState()
}

export function saveState(state: WorkshopState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage full or unavailable (e.g. large floor-plan image) — ignore.
  }
}

export function exportState(state: WorkshopState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${state.name.replace(/\s+/g, '-').toLowerCase() || 'workshop'}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function parseImportedState(text: string): WorkshopState | null {
  try {
    const parsed = JSON.parse(text) as WorkshopState
    if (parsed && parsed.version === 1 && Array.isArray(parsed.items)) {
      return parsed
    }
  } catch {
    // ignore
  }
  return null
}

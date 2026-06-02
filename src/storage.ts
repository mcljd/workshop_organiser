import type { WorkshopState } from './types'
import { defaultScenario } from './scenarios'
import { seedItemDates } from './manager'

const STORAGE_KEY = 'workshop-organiser:state:v2'

export function createDefaultState(): WorkshopState {
  return defaultScenario()
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export function loadState(): WorkshopState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createDefaultState()
    const parsed = JSON.parse(raw) as WorkshopState
    if (parsed && parsed.version === 2 && Array.isArray(parsed.items)) {
      // Backfill anything an older save might be missing.
      parsed.zones ??= []
      for (const item of parsed.items) item.shape ??= 'box'
      seedItemDates(parsed.items) // backfill dates for older saves
      return parsed
    }
  } catch {
    // Corrupt or incompatible saved data — fall back to a clean demo.
  }
  return createDefaultState()
}

export function saveState(state: WorkshopState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage full or unavailable — ignore.
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
    if (parsed && parsed.version === 2 && Array.isArray(parsed.items)) {
      parsed.zones ??= []
      for (const item of parsed.items) item.shape ??= 'box'
      return parsed
    }
  } catch {
    // ignore
  }
  return null
}

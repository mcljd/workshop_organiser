import { createClient, type RealtimeChannel } from '@supabase/supabase-js'
import type { WorkshopState } from './types'

// Live, shareable sites backed by Supabase. A site is one row in `workshops`
// (state as JSONB). "Go live" inserts a row and puts ?site=<id> in the URL;
// anyone opening that link loads it and subscribes to realtime updates, so
// multiple devices see the same yard change live.
//
// Demo note: the table uses open (public) read/write so a link just works
// with no sign-in. Add auth + per-site ownership before real production use.

const SUPABASE_URL = 'https://zftoqqrqsxctehltebad.supabase.co'
const SUPABASE_KEY = 'sb_publishable_Um1d_4KzZJys2WSjLgc4cQ_JrgFUcPo'

/** Distinguishes this tab's own writes from genuine remote updates. */
export const CLIENT_ID = Math.random().toString(36).slice(2)

const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
  realtime: { params: { eventsPerSecond: 5 } },
})

export function siteIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('site')
}

export async function createSite(state: WorkshopState): Promise<string> {
  const { data, error } = await client
    .from('workshops')
    .insert({ name: state.name, state })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

export async function loadSite(id: string): Promise<WorkshopState | null> {
  const { data, error } = await client.from('workshops').select('state').eq('id', id).single()
  if (error || !data) return null
  return data.state as WorkshopState
}

export async function saveSite(id: string, state: WorkshopState): Promise<void> {
  await client
    .from('workshops')
    .update({ name: state.name, state, updated_at: new Date().toISOString() })
    .eq('id', id)
}

export function subscribeSite(id: string, onRemote: (s: WorkshopState) => void): RealtimeChannel {
  return client
    .channel(`workshop-${id}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'workshops', filter: `id=eq.${id}` },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (payload: any) => onRemote(payload.new.state as WorkshopState),
    )
    .subscribe()
}

export function unsubscribe(ch: RealtimeChannel): void {
  client.removeChannel(ch)
}

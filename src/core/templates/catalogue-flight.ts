import 'server-only'

import { randomUUID } from 'node:crypto'
import { setTimeout as pause } from 'node:timers/promises'

import type { ConditionalJsonStore, StoredJson } from '../storage/conditional-json'

// Share a fill with concurrent or slightly later misses, while the Next tag cache owns
// long-lived reads. Every new fill uses live data and every admin change fences the object.
export const CREATE_FLIGHT_KEY = 'ops/cache/create-catalogue/v3.json'
const LEASE_MS = 12_000
const READY_WINDOW_MS = 2_000
const PRELOAD_LEASE_MS = 9_000
const PRELOAD_READY_WINDOW_MS = 5_000
const WAIT_MS = 16_000
const FAILURE_MS = 1_000

type Revision = { revision: string; preloadedOn?: string }
type Lease = Revision & { owner: string; until: number; early?: true }

type State<T> =
  | (Revision & { phase: 'invalidated' })
  | (Lease & { phase: 'filling' | 'failed' })
  | (Omit<Lease, 'until'> & { phase: 'ready'; finished: number; snapshot: T })

export class CatalogueCoordinationError extends Error {
  constructor(cause: unknown) {
    super('Catalogue coordination storage is unavailable', { cause })
  }
}

function stateOf<T>(entry: StoredJson | null) {
  return entry?.value as State<T> | undefined
}

async function storeOp<T>(operation: Promise<T>) {
  try {
    return await operation
  } catch (error) {
    throw new CatalogueCoordinationError(error)
  }
}

async function completeFill<T>(store: ConditionalJsonStore, etag: string, lease: Lease, fill: () => Promise<T>) {
  let snapshot: T
  try {
    snapshot = await fill()
  } catch (error) {
    // A brief shared backoff avoids immediately queuing another burst against a failing origin.
    await store.write(CREATE_FLIGHT_KEY, { ...lease, phase: 'failed', until: Date.now() + FAILURE_MS }, etag).catch(() => null)
    throw error
  }
  const finished = Date.now()
  const { until, ...identity } = lease
  if (finished >= until) return null
  const ready = { ...identity, phase: 'ready', finished, snapshot }
  const published = await storeOp(store.write(CREATE_FLIGHT_KEY, ready, etag))
  return published ? { snapshot } : null
}

type Reader = { started: number; owner: string; watching?: string }

function completedFor<T>(state: State<T> | undefined, reader: Reader): state is Extract<State<T>, { phase: 'ready' }> {
  if (state?.phase !== 'ready') return false
  const window = state.early ? PRELOAD_READY_WINDOW_MS : READY_WINDOW_MS
  return state.owner === reader.watching || state.finished + window >= reader.started
}

function activeFlight<T>(state: State<T> | undefined): state is Extract<State<T>, { phase: 'filling' | 'failed' }> {
  return (state?.phase === 'filling' || state?.phase === 'failed') && state.until > Date.now()
}

async function claim<T>(store: ConditionalJsonStore, reader: Reader, { revision, preloadedOn }: Revision, expected: string | null, fill: () => Promise<T>, early?: true) {
  const until = Date.now() + (early ? PRELOAD_LEASE_MS : LEASE_MS)
  const lease = { owner: reader.owner, revision, preloadedOn, until, early }
  const claimed = await storeOp(store.write(CREATE_FLIGHT_KEY, { ...lease, phase: 'filling' }, expected))
  return claimed ? completeFill(store, claimed, lease, fill) : null
}

async function attempt<T>(store: ConditionalJsonStore, reader: Reader, fill: () => Promise<T>) {
  const entry = await storeOp(store.read(CREATE_FLIGHT_KEY))
  const state = stateOf<T>(entry)
  if (completedFor(state, reader)) return { snapshot: state.snapshot }
  if (activeFlight(state)) {
    reader.watching = state.owner
    await pause(120 + Math.random() * 100)
    return null
  }
  return claim(store, reader, state ?? { revision: randomUUID() }, entry?.etag ?? null, fill)
}

// Start the same fill while the page instance starts. This optional work never polls or
// competes with an active fill. The mark prevents repeat speculative fills on the same
// build. Give its result a few more seconds to reach a starting page instance.
export async function preloadCatalogue<T>(store: ConditionalJsonStore, version: string, fill: () => Promise<T>): Promise<boolean> {
  const reader: Reader = { started: Date.now(), owner: randomUUID() }
  const entry = await storeOp(store.read(CREATE_FLIGHT_KEY))
  const state = stateOf<T>(entry)
  if (state?.preloadedOn === version || completedFor(state, reader) || activeFlight(state)) return false
  const revision = { revision: state?.revision ?? randomUUID(), preloadedOn: version }
  return Boolean(await claim(store, reader, revision, entry?.etag ?? null, fill, true))
}

export async function coordinateCatalogue<T>(store: ConditionalJsonStore, fill: () => Promise<T>): Promise<T> {
  const reader: Reader = { started: Date.now(), owner: randomUUID() }
  // The object normally already exists, even after invalidation. Check for a reusable
  // result or an active lease without submitting a write that R2 would reject.
  while (Date.now() - reader.started < WAIT_MS) {
    const result = await attempt(store, reader, fill)
    if (result) return result.snapshot
    // An admin invalidation or expired lease may displace the owner during the read.
    // Read the new generation rather than returning a displaced snapshot to Next.
  }
  throw new Error('Timed out waiting for the shared Create catalogue')
}

export async function discardCatalogueFlight(store: ConditionalJsonStore) {
  if (!await store.write(CREATE_FLIGHT_KEY, { phase: 'invalidated', revision: randomUUID() })) {
    throw new Error('Could not invalidate the shared Create catalogue')
  }
}

// When an invalidation write cannot be confirmed, wait out any pre-save lease and
// the short completed-result window before expiring the authoritative Next tags.
// Other owners in this window fetch live data and cannot reintroduce a pre-save cache value.
export function waitOutCatalogueFlight() {
  return pause(Math.max(LEASE_MS + READY_WINDOW_MS, PRELOAD_LEASE_MS + PRELOAD_READY_WINDOW_MS) + 1_000)
}

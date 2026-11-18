import 'server-only'

import { randomUUID } from 'node:crypto'
import { setTimeout as pause } from 'node:timers/promises'

import type { ConditionalJsonStore, StoredJson } from '../storage/conditional-json'

// Share a fill with concurrent or slightly later misses, while the Next tag cache owns
// long-lived reads. Every new fill uses live data and every admin change fences the object.
export const CREATE_FLIGHT_KEY = 'ops/cache/create-catalogue/v3.json'
const LEASE_MS = 12_000
const READY_WINDOW_MS = 2_000
const WAIT_MS = 16_000
const FAILURE_MS = 1_000

type Lease = { owner: string; revision: string; until: number }

type State<T> =
  | { phase: 'invalidated'; revision: string }
  | (Lease & { phase: 'filling' | 'failed' })
  | { phase: 'ready'; owner: string; finished: number; revision: string; snapshot: T }

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
  if (finished >= lease.until) return null
  const ready = { phase: 'ready', owner: lease.owner, revision: lease.revision, finished, snapshot }
  const published = await storeOp(store.write(CREATE_FLIGHT_KEY, ready, etag))
  return published ? { snapshot } : null
}

type Reader = { started: number; owner: string; watching?: string }

function completedFor<T>(state: State<T> | undefined, reader: Reader): state is Extract<State<T>, { phase: 'ready' }> {
  return state?.phase === 'ready' && (state.owner === reader.watching || state.finished + READY_WINDOW_MS >= reader.started)
}

function activeFlight<T>(state: State<T> | undefined): state is Extract<State<T>, { phase: 'filling' | 'failed' }> {
  return (state?.phase === 'filling' || state?.phase === 'failed') && state.until > Date.now()
}

async function claim<T>(store: ConditionalJsonStore, reader: Reader, revision: string, expected: string | null, fill: () => Promise<T>) {
  const lease = { owner: reader.owner, revision, until: Date.now() + LEASE_MS }
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
  return claim(store, reader, state?.revision ?? randomUUID(), entry?.etag ?? null, fill)
}

export async function coordinateCatalogue<T>(store: ConditionalJsonStore, fill: () => Promise<T>): Promise<T> {
  const reader: Reader = { started: Date.now(), owner: randomUUID() }
  // A genuinely empty cache can elect its first owner without a preceding GET round trip.
  const first = await claim(store, reader, randomUUID(), null, fill)
  if (first) return first.snapshot
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
  return pause(LEASE_MS + READY_WINDOW_MS + 1_000)
}

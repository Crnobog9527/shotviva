import { z } from 'zod'

import { LEGACY_RESOLUTIONS, RESOLUTIONS, normalizeResolution } from './output-options'

// The site calls the top tier '4k'. Until the contract migration renames it in the database,
// every table, constraint and SQL function still stores and expects '3k' (ARCHITECTURE §8.1).
// Everything that writes tier ids or tier-keyed objects to the database goes through toDb*;
// everything that reads them goes through the schemas below (or fromDbTiers), which also
// accept '4k' so the same code keeps working once the database stores the new name.

const DB_TOP_TIER = '3k'

// Fields whose values are tier ids. `declared_resolutions` is deliberately absent: it only words
// the provider audit row, which names the tiers as the admin saw them (4K).
const TIER_LIST_KEYS = new Set(['resolution', 'resolutions', 'unpriced_resolutions', 'unpricedResolutions', 'p_resolution', 'p_unpriced', 'resolutionLimit'])

function isTierId(value: unknown): value is string {
  return typeof value === 'string' && ((RESOLUTIONS as readonly string[]).includes(value) || Object.hasOwn(LEGACY_RESOLUTIONS, value))
}

// Renames tier keys in objects, and tier ids under the known tier fields (directly or as array
// items), at any depth; a bare tier id or array of tier ids at the top (an RPC's scalar result)
// too. Nothing else is touched: a user's text that happens to be "4k" in any other field stays.
function mapTiers(value: unknown, rename: (tier: string) => string, underTierKey = false): unknown {
  if (underTierKey && isTierId(value)) return rename(value)
  if (Array.isArray(value)) return value.map((item) => mapTiers(item, rename, underTierKey))
  if (value && typeof value === 'object') {
    // An object that already has both names keeps both, so a strict schema rejects it instead of
    // one price silently replacing the other.
    const renameKey = (key: string) => (isTierId(key) && !Object.hasOwn(value, rename(key)) ? rename(key) : key)
    return Object.fromEntries(Object.entries(value).map(([key, item]) =>
      [renameKey(key), mapTiers(item, rename, TIER_LIST_KEYS.has(key))]))
  }
  return value
}

const topLevel = (value: unknown) => isTierId(value) || (Array.isArray(value) && value.length > 0 && value.every(isTierId))

const toDbTier = (tier: string) => (tier === '4k' ? DB_TOP_TIER : tier)
const fromDbTier = (tier: string) => normalizeResolution(tier) as string

export function toDbTiers<T>(value: T): T {
  return mapTiers(value, toDbTier, topLevel(value)) as T
}

export function fromDbTiers<T>(value: T): T {
  return mapTiers(value, fromDbTier, topLevel(value)) as T
}

// fetch for the Supabase clients: PostgREST request bodies (RPC arguments, inserts, updates) go
// out with database tier names, and JSON responses come back with site names. One choke point,
// so no query can miss the rename; removed by the contract migration's follow-up. Bodies are
// only parsed when they contain a tier id, so ordinary traffic pays one substring search.
const requestUrl = (input: Parameters<typeof fetch>[0]) => (typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)

function outgoing(init: RequestInit | undefined): RequestInit | undefined {
  const body = init?.body
  if (typeof body !== 'string' || !body.includes('"4k"')) return init
  return { ...init, body: JSON.stringify(toDbTiers(JSON.parse(body))) }
}

async function incoming(response: Response): Promise<Response> {
  if (!response.body || !(response.headers.get('content-type') ?? '').includes('json')) return response
  const text = await response.text()
  if (!text.includes('"3k"')) return new Response(text, response)
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  return new Response(JSON.stringify(fromDbTiers(JSON.parse(text))), { status: response.status, statusText: response.statusText, headers })
}

export function withDbTiers(base: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    if (!requestUrl(input).includes('/rest/v1/')) return base(input, init)
    return incoming(await base(input, outgoing(init)))
  }
}

// z.enum(RESOLUTIONS) that also reads the legacy '3k'.
export const resolutionSchema = z.preprocess(normalizeResolution, z.enum(RESOLUTIONS))

const renameKeys = (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? fromDbTiers(value) : value)

// Any schema over a tier-keyed object, with '3k' keys read as '4k' first.
export const withTierKeys = <S extends z.ZodType>(schema: S) => z.preprocess(renameKeys, schema)

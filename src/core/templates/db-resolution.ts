import { z } from 'zod'

import { LEGACY_RESOLUTIONS, RESOLUTIONS, normalizeResolution } from './output-options'

// The top tier is '4k' everywhere since migration 1431 renamed it in the database (ARCHITECTURE
// §8.1). Writes send '4k' as they are; the database also turns a '3k' from older code into '4k'.
// History keeps the old name: generation jobs made before the rename say '3k'. So everything that
// reads tier ids goes through the schemas below (or fromDbTiers), which read '3k' as '4k'.

const TIER_LIST_KEYS = new Set(['resolution', 'resolutions', 'unpriced_resolutions', 'unpricedResolutions', 'p_resolution', 'p_unpriced'])

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

const fromDbTier = (tier: string) => normalizeResolution(tier) as string

export function fromDbTiers<T>(value: T): T {
  return mapTiers(value, fromDbTier, topLevel(value)) as T
}

// fetch for the Supabase clients: JSON responses come back with '3k' (old job history) read as
// '4k', at one choke point so no query can miss it. Requests go out unchanged. Bodies are only
// parsed when they contain '3k', so ordinary traffic pays one substring search.
const requestUrl = (input: Parameters<typeof fetch>[0]) => (typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)

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
    return incoming(await base(input, init))
  }
}

// z.enum(RESOLUTIONS) that also reads the legacy '3k'.
export const resolutionSchema = z.preprocess(normalizeResolution, z.enum(RESOLUTIONS))

const renameKeys = (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? fromDbTiers(value) : value)

// Any schema over a tier-keyed object, with '3k' keys read as '4k' first.
export const withTierKeys = <S extends z.ZodType>(schema: S) => z.preprocess(renameKeys, schema)

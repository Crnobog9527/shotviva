import { describe, expect, it, vi } from 'vitest'

import { fromDbTiers, resolutionSchema, toDbTiers, withDbTiers, withTierKeys } from './db-resolution'
import { creditsCostSchema } from './pricing'
import { imageCapabilitiesSchema } from './image-capabilities'
import { normalizeResolution } from './output-options'
import { z } from 'zod'

describe('tier ids between the site (4k) and the database (3k until the contract migration)', () => {
  it('reads the legacy id as 4k and leaves everything else alone', () => {
    expect(normalizeResolution('3k')).toBe('4k')
    expect(normalizeResolution('4k')).toBe('4k')
    expect(normalizeResolution('2k')).toBe('2k')
    expect(normalizeResolution('3K')).toBe('3K')
    expect(resolutionSchema.parse('3k')).toBe('4k')
    expect(resolutionSchema.safeParse('8k').success).toBe(false)
  })

  it('renames tier keys and tier-field values at any depth, nothing else', () => {
    const site = {
      credits_cost: { '1k': 2, '2k': 4, '4k': 6 },
      inputs: { resolution: '4k', copy: { headline: '4k', note: 'make it 4k' } },
      resolutions: ['1k', '4k'],
      capabilities: { resolutions: ['4k'], catalogImageCosts: { '4k': 0.2 }, aspectRatios: ['1:1'] },
      unpriced_resolutions: ['4k'],
      tags: ['4k'],
    }
    const db = toDbTiers(site)
    expect(db).toEqual({
      credits_cost: { '1k': 2, '2k': 4, '3k': 6 },
      inputs: { resolution: '3k', copy: { headline: '4k', note: 'make it 4k' } },
      resolutions: ['1k', '3k'],
      capabilities: { resolutions: ['3k'], catalogImageCosts: { '3k': 0.2 }, aspectRatios: ['1:1'] },
      unpriced_resolutions: ['3k'],
      tags: ['4k'],
    })
    expect(fromDbTiers(db)).toEqual(site)
    // Already-renamed rows (after the contract migration) read unchanged.
    expect(fromDbTiers(site)).toEqual(site)
  })

  it('never treats an inherited property name as a tier id', () => {
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(normalizeResolution(name)).toBe(name)
      expect(resolutionSchema.safeParse(name).success).toBe(false)
    }
    const row = JSON.parse('{"constructor":"a","toString":"b","__proto__":"c","resolution":"toString"}')
    expect(fromDbTiers(row)).toEqual(row)
    expect(JSON.stringify(toDbTiers(row))).toBe(JSON.stringify(row))
  })

  it('renames a bare tier id or tier list returned by an RPC', () => {
    expect(fromDbTiers(['1k', '3k'])).toEqual(['1k', '4k'])
    expect(fromDbTiers('3k')).toBe('4k')
    expect(toDbTiers(['4k'])).toEqual(['3k'])
    expect(fromDbTiers(['3k', 'other'])).toEqual(['3k', 'other'])
  })

  it('reads stored prices and capabilities with the old key', () => {
    expect(creditsCostSchema.parse({ '1k': 2, '2k': 4, '3k': 6 })).toEqual({ '1k': 2, '2k': 4, '4k': 6 })
    expect(creditsCostSchema.safeParse({ '1k': 2, '2k': 4, '3k': 6, '4k': 6 }).success).toBe(false)
    const caps = imageCapabilitiesSchema.parse({
      resolutions: ['1k', '3k'], aspectRatios: ['1:1'], originalRatio: true, minReferences: 0, maxReferences: 4,
      catalogImageCosts: { '3k': 0.2 }, fetchedAt: '2026-11-12T00:00:00.000Z',
    })
    expect(caps.resolutions).toEqual(['1k', '4k'])
    expect(caps.catalogImageCosts).toEqual({ '4k': 0.2 })
    expect(withTierKeys(z.record(z.string(), z.number())).parse({ '3k': 1 })).toEqual({ '4k': 1 })
  })
})

describe('withDbTiers (the Supabase clients\' fetch)', () => {
  const json = (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json; charset=utf-8', 'content-length': '999' }, ...init })

  it('sends database names and returns site names for PostgREST calls', async () => {
    const base = vi.fn(async (...args: [RequestInfo | URL, RequestInit?]) => args && json([{ id: 'a', credits_cost: { '1k': 1, '2k': 2, '3k': 3 } }]))
    const tierFetch = withDbTiers(base as typeof fetch)
    const response = await tierFetch('https://x.supabase.co/rest/v1/rpc/reserve_credits', { method: 'POST', body: JSON.stringify({ p_inputs: { resolution: '4k' } }) })
    expect(JSON.parse(base.mock.calls[0]![1]!.body as string)).toEqual({ p_inputs: { resolution: '3k' } })
    expect(await response.json()).toEqual([{ id: 'a', credits_cost: { '1k': 1, '2k': 2, '4k': 3 } }])
    expect(response.headers.get('content-length')).toBeNull()
    expect(response.status).toBe(200)
  })

  it('passes other traffic through untouched', async () => {
    const original = json({ resolution: '3k' })
    const base = vi.fn(async () => original)
    const tierFetch = withDbTiers(base as typeof fetch)
    const init = { method: 'POST', body: JSON.stringify({ resolution: '4k' }) }
    expect(await tierFetch('https://x.supabase.co/auth/v1/token', init)).toBe(original)
    expect(base.mock.calls[0]).toEqual(['https://x.supabase.co/auth/v1/token', init])
  })

  it('keeps empty and non-JSON responses, and bodies without a tier id', async () => {
    const empty = new Response(null, { status: 204 })
    const tierFetch = withDbTiers((async () => empty) as typeof fetch)
    expect(await tierFetch('https://x.supabase.co/rest/v1/templates', { method: 'PATCH', body: '{"name":"x"}' })).toBe(empty)
    const text = withDbTiers((async () => json({ name: 'plain' }, { status: 201 })) as typeof fetch)
    const response = await text('https://x.supabase.co/rest/v1/templates')
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ name: 'plain' })
  })
})

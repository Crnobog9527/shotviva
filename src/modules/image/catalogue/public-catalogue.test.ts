import { describe, expect, it } from 'vitest'

import type { CataloguePayload } from './catalogue-payload'
import type { CatalogueTemplate } from './catalogue-template'
import { CATALOGUE_SCHEMA, isPublicCatalogue, openToEveryone, PUBLIC_TEMPLATE_KEYS, toPublicPayload } from './public-catalogue'

// A template as it may come from the source, with fields that must never reach the public file.
const template = (id: string, extra: Record<string, unknown> = {}) => ({
  id, name: id, category: 'food', categoryName: 'Food', categoryOrder: 1, compare: false, description: null,
  creditsCost: { '1k': 10 }, copyFields: [], toggles: [],
  cover: { type: 'image', before: 'b.webp', after: 'a.webp', motion: null, poster: null, prompt: 'leak' },
  prompt: 'secret prompt', cost_usd: 0.04, provider: 'openai/gpt-image', ...extra,
}) as unknown as CatalogueTemplate

const payload = (): CataloguePayload => ({
  browse: {
    filters: [{ slug: 'food', name: 'Food', key: 'food', intro: 'x', children: [], internal: true } as never],
    entries: [
      { type: 'template', id: 'plain', path: ['food'] },
      { type: 'template', id: 'poster', path: ['posters'] },
      { type: 'series', path: ['food'], series: { id: 's', slug: 's', name: 'S', description: null, cover: null, categoryName: 'Food', memberIds: ['plain', 'poster'], owner: 'x' } as never },
      { type: 'series', path: ['posters'], series: { id: 'p', slug: 'p', name: 'P', description: null, cover: null, categoryName: 'Posters', memberIds: ['poster'] } },
    ],
  },
  templates: [template('plain'), template('poster', { poster: true })],
})

describe('public catalogue file', () => {
  it('carries only the allowlisted fields of a template, its cover, its series and its filters', () => {
    const out = toPublicPayload(payload(), { posters: true })
    for (const item of out.templates) {
      expect(Object.keys(item).every((key) => (PUBLIC_TEMPLATE_KEYS as readonly string[]).includes(key))).toBe(true)
      expect(Object.keys(item.cover).sort()).toEqual(['after', 'before', 'motion', 'poster', 'type'])
    }
    const body = JSON.stringify(out)
    for (const secret of ['secret prompt', 'cost_usd', 'provider', 'leak', 'internal', 'owner']) expect(body).not.toContain(secret)
  })

  it('leaves out the poster templates while they are entitlement-specific (a tier gate), and the series left empty', () => {
    const out = toPublicPayload(payload(), { posters: false })
    expect(out.templates.map((item) => item.id)).toEqual(['plain'])
    expect(out.browse.entries).toEqual([
      { type: 'template', id: 'plain', path: ['food'] },
      { type: 'series', path: ['food'], series: { id: 's', slug: 's', name: 'S', description: null, cover: null, categoryName: 'Food', memberIds: ['plain'] } },
    ])
  })

  it('keeps them while the feature is open to every account', () => {
    expect(toPublicPayload(payload(), { posters: true }).templates.map((item) => item.id)).toEqual(['plain', 'poster'])
  })
})

// A device copy is used only when it is this file, for this language and schema.
describe('device copy check', () => {
  const file = { schema: CATALOGUE_SCHEMA, locale: 'zh', version: '0123456789abcdef', payload: payload() }

  it('accepts the current schema and language', () => {
    expect(isPublicCatalogue(file, 'zh')).toBe(true)
  })

  it('rejects another schema, another language, a bad version or a broken payload', () => {
    expect(isPublicCatalogue({ ...file, schema: CATALOGUE_SCHEMA + 1 }, 'zh')).toBe(false)
    expect(isPublicCatalogue(file, 'en')).toBe(false)
    expect(isPublicCatalogue({ ...file, version: 'latest' }, 'zh')).toBe(false)
    expect(isPublicCatalogue({ ...file, payload: { templates: 'x' } }, 'zh')).toBe(false)
    expect(isPublicCatalogue('{"schema":1}', 'zh')).toBe(false)
    expect(isPublicCatalogue(null, 'zh')).toBe(false)
  })
})

// Poster templates join the public file only while the feature is open to every account, by the
// rules featureAllowed uses (review of #883: invite-only and a future open_to_all_at are gates).
describe('open to every account', () => {
  const now = Date.parse('2026-11-24T00:00:00Z')
  const past = '2026-11-01T00:00:00Z'
  const future = '2026-12-01T00:00:00Z'

  it('no access row, or no tier gate: open', () => {
    expect(openToEveryone(false, undefined, now)).toBe(true)
    expect(openToEveryone(false, { minTier: null, openToAllAt: null }, now)).toBe(true)
  })

  it('a tier gate: gated until open_to_all_at has passed', () => {
    expect(openToEveryone(false, { minTier: 'pro', openToAllAt: null }, now)).toBe(false)
    expect(openToEveryone(false, { minTier: 'pro', openToAllAt: future }, now)).toBe(false)
    expect(openToEveryone(false, { minTier: 'pro', openToAllAt: past }, now)).toBe(true)
  })

  it('invite-only: gated, with or without a tier, until open_to_all_at has passed', () => {
    expect(openToEveryone(true, undefined, now)).toBe(false)
    expect(openToEveryone(true, { minTier: null, openToAllAt: null }, now)).toBe(false)
    expect(openToEveryone(true, { minTier: null, openToAllAt: future }, now)).toBe(false)
    expect(openToEveryone(true, { minTier: null, openToAllAt: past }, now)).toBe(true)
  })
})

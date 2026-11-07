import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bulkEditTemplates, saveTemplate, setTemplateActive } from '@/core/admin'

import { CREDITS_FLOOR } from '@/modules/image/credits-floor'

import { connectAdmin, createUser } from './helpers'
import { serviceSupabase as serviceClient } from './supabase-env'

// T79 (ARCHITECTURE §10 「模板批量编辑」): admin_bulk_edit_templates through the command the
// dialog calls. Every template is floor-checked as it would be after the edit; one failure and
// the whole batch is left alone.
const LOG_ID = '00000000-0000-0000-0000-000000000001'
const ids = ['test-bulkedit-1', 'test-bulkedit-2', 'test-bulkedit-3', 'test-bulkedit-4', 'test-bulkedit-5']
const PARTNER = 'test-bulkedit-partner'

const template = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: id,
  // A seeded T75 category key; the batch-category case moves templates to 'pets'.
  category: 'food-drink',
  quality: 'high',
  creditsCost: { '1k': 2, '2k': 4, '3k': 6 },
  visibleIn: ['web'],
  fields: { images: { min: 1, max: 1 }, copy: [], aspectRatios: ['1:1'] },
  description: 'Test template.',
  coverBeforeUrl: `https://assets.test/covers/${id}/before.webp`,
  coverAfterUrl: `https://assets.test/covers/${id}/after.webp`,
  ...over,
})
const prompt = { body: 'one', modelParams: {} }

describe('batch edit of templates', () => {
  let pg: Client
  let admin: string
  const client = serviceClient()
  const rows = async () => {
    const { rows } = await pg.query<{ id: string; quality: string; credits_cost: Record<string, number>; visible_in: string[] }>(
      'select id, quality, credits_cost, visible_in from public.templates where id like $1 order by id',
      ['test-bulkedit-%'],
    )
    return Object.fromEntries(rows.map((row) => [row.id, row]))
  }

  beforeAll(async () => {
    pg = await connectAdmin()
    admin = await createUser(pg)
    await pg.query("update public.profiles set role = 'admin' where id = $1", [admin])
    for (const id of ids) {
      await saveTemplate(client, LOG_ID, { isNew: true, template: template(id), prompt }, CREDITS_FLOOR)
    }
    // Live, partner only, and missing what a web card needs.
    await saveTemplate(client, LOG_ID, { isNew: true, template: template(PARTNER, { visibleIn: ['partner'], description: '' }), prompt }, CREDITS_FLOOR)
    await setTemplateActive(client, LOG_ID, { id: PARTNER, active: true }, CREDITS_FLOOR)
  })

  afterAll(async () => {
    await pg.query('delete from public.templates where id like $1', ['test-bulkedit-%'])
    await pg.end()
  })

  it('changes the HD price and the quality of five templates in one call', async () => {
    const outcome = await bulkEditTemplates(client, admin, { ids, patch: { creditsCost: { '2k': 5 }, quality: 'medium' } }, CREDITS_FLOOR)
    expect(outcome).toEqual({ changed: 5, failures: [] })
    for (const id of ids) {
      expect((await rows())[id]).toMatchObject({ quality: 'medium', credits_cost: { '1k': 2, '2k': 5, '3k': 6 }, visible_in: ['web'] })
    }
  })

  it('saves nothing when one tier would fall below the floor, and lists every template', async () => {
    const before = await rows()
    const outcome = await bulkEditTemplates(client, admin, { ids, patch: { creditsCost: { '1k': 1 }, quality: 'high' } }, CREDITS_FLOOR)
    expect(outcome.changed).toBe(0)
    expect(outcome.failures).toHaveLength(5)
    expect(outcome.failures[0]).toMatchObject({ reason: 'below_floor', resolution: '1k', floor: 2, given: 1 })
    expect(await rows()).toEqual(before)
  })

  it('checks the new quality floor even when no price changes', async () => {
    await bulkEditTemplates(client, admin, { ids: ids.slice(0, 1), patch: { creditsCost: { '1k': 1, '2k': 2, '3k': 3 }, quality: 'medium' } }, CREDITS_FLOOR)
    const outcome = await bulkEditTemplates(client, admin, { ids: ids.slice(0, 2), patch: { quality: 'high' } }, CREDITS_FLOOR)
    expect(outcome.failures.map((failure) => failure.id)).toEqual([ids[0], ids[0], ids[0]])
    expect((await rows())[ids[1]!]?.quality).toBe('medium')
  })

  it('refuses putting a live template on the web without its description, and changes entry points otherwise', async () => {
    const refused = await bulkEditTemplates(client, admin, { ids: [ids[1]!, PARTNER], patch: { visibleIn: ['web', 'partner'] } }, CREDITS_FLOOR)
    expect(refused.failures).toEqual([{ id: PARTNER, name: PARTNER, reason: 'web_incomplete' }])
    expect((await rows())[ids[1]!]?.visible_in).toEqual(['web'])
    const saved = await bulkEditTemplates(client, admin, { ids: [ids[1]!, ids[2]!], patch: { visibleIn: ['web', 'partner'] } }, CREDITS_FLOOR)
    expect(saved.changed).toBe(2)
    expect((await rows())[ids[2]!]?.visible_in).toEqual(['web', 'partner'])
  })

  // T75 categories: a batch moves templates into one category; system categories are no target.
  it('moves templates into a category, never into a system one', async () => {
    const outcome = await bulkEditTemplates(client, admin, { ids: ids.slice(0, 2), patch: { categoryKey: 'pets' } }, CREDITS_FLOOR)
    expect(outcome).toEqual({ changed: 2, failures: [] })
    const { rows: moved } = await pg.query<{ category_key: string; category: string }>(
      'select category_key, category from public.templates where id = any($1)',
      [ids.slice(0, 2)],
    )
    expect(moved).toEqual([
      { category_key: 'pets', category: 'Pets' },
      { category_key: 'pets', category: 'Pets' },
    ])
    for (const target of ['freeform', 'edit', 'no-such-category']) {
      await expect(bulkEditTemplates(client, admin, { ids, patch: { categoryKey: target } }, CREDITS_FLOOR)).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      })
    }
    const { rows: still } = await pg.query<{ n: number }>(
      "select count(*)::int as n from public.templates where id = any($1) and category_key in ('freeform', 'edit')",
      [ids],
    )
    expect(still[0]?.n).toBe(0)
  })

  it('refuses unknown and system templates, bad input and a caller who is not an admin', async () => {
    const missing = await bulkEditTemplates(client, admin, { ids: ['test-bulkedit-nope', 'edit'], patch: { quality: 'high' } }, CREDITS_FLOOR)
    expect(missing.failures.map((failure) => failure.reason).sort()).toEqual(['not_found', 'system'])
    await expect(bulkEditTemplates(client, admin, { ids, patch: {} }, CREDITS_FLOOR)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(
      pg.query('select public.admin_bulk_edit_templates($1, $2, $3, $4)', [ids, { credits_cost: { '2k': 0 } }, CREDITS_FLOOR, admin]),
    ).rejects.toThrow(/INVALID_INPUT/)
    const visitor = await createUser(pg)
    await expect(bulkEditTemplates(client, visitor, { ids, patch: { quality: 'high' } }, CREDITS_FLOOR)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    const { rows: grants } = await pg.query<{ auth: boolean; anon: boolean }>(
      `select has_function_privilege('authenticated', 'public.admin_bulk_edit_templates(text[], jsonb, jsonb, uuid)', 'execute') as auth,
              has_function_privilege('anon', 'public.admin_bulk_edit_templates(text[], jsonb, jsonb, uuid)', 'execute') as anon`,
    )
    expect(grants[0]).toEqual({ auth: false, anon: false })
  })
})

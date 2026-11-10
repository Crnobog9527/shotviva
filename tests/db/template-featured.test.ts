import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bulkEditTemplates, saveTemplate, setFeaturedTemplates, setTemplateActive, setTemplateOrder } from '@/core/admin'
import { listTemplatesIn } from '@/core/templates'

import { CREDITS_FLOOR } from '@/modules/image/credits-floor'

import { connectAdmin, createUser, approveFixtures } from './helpers'
import { serviceSupabase as serviceClient } from './supabase-env'

// T53 (ARCHITECTURE §12 home item 3): the home featured list, chosen and ordered in admin.
const ADMIN_ID = '00000000-0000-0000-0000-000000000001'
const ids = ['test-feat-a', 'test-feat-b', 'test-feat-c'] as const
const [A, B, C] = ids
const HIDDEN = 'test-feat-hidden'

const template = (id: string) => ({
  id,
  name: id,
  category: 'pets',
  quality: 'high',
  creditsCost: { '1k': 2, '2k': 4, '3k': 6 },
  visibleIn: ['web'],
  fields: { images: { min: 1, max: 1 }, copy: [], aspectRatios: ['1:1'] },
  // What a web template needs before it may go live (T60 publish rules).
  description: 'Test template.',
  coverBeforeUrl: `https://assets.test/covers/${id}/before.webp`,
  coverAfterUrl: `https://assets.test/covers/${id}/after.webp`,
})
const prompt = { body: 'one', modelParams: {} }

describe('home featured templates', () => {
  let pg: Client
  const client = serviceClient()
  const ranks = async () => {
    const { rows } = await pg.query<{ id: string; featured_rank: number | null }>(
      'select id, featured_rank from public.templates where id like $1 order by id',
      ['test-feat-%'],
    )
    return Object.fromEntries(rows.map((row) => [row.id, row.featured_rank]))
  }

  beforeAll(async () => {
    pg = await connectAdmin()
    for (const id of [...ids, HIDDEN]) await saveTemplate(client, ADMIN_ID, { isNew: true, template: template(id), prompt }, CREDITS_FLOOR)
    await approveFixtures(pg,...ids)
    for (const id of ids) await setTemplateActive(client, ADMIN_ID, { id, active: true }, CREDITS_FLOOR)
  })

  afterAll(async () => {
    await pg.query('delete from public.templates where id like $1', ['test-feat-%'])
    await pg.end()
  })

  it('stores the list in display order and un-features everything else', async () => {
    await setFeaturedTemplates(client, ADMIN_ID, [B, A])
    expect(await ranks()).toMatchObject({ [B]: 1, [A]: 2, [C]: null })
    // A reorder rewrites every position without tripping the one-per-position index.
    await setFeaturedTemplates(client, ADMIN_ID, [A, C, B])
    expect(await ranks()).toMatchObject({ [A]: 1, [C]: 2, [B]: 3 })
    const live = await listTemplatesIn(client, 'en')
    expect(live.find((row) => row.id === C)?.featuredRank).toBe(2)
  })

  it('refuses more than 12, repeats and unpublished templates, changing nothing', async () => {
    const thirteen = Array.from({ length: 13 }, (_, i) => `test-feat-${i}`)
    await expect(setFeaturedTemplates(client, ADMIN_ID, thirteen)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(setFeaturedTemplates(client, ADMIN_ID, [A, A])).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(setFeaturedTemplates(client, ADMIN_ID, [A, HIDDEN])).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    // Past the app's own check, the database still refuses.
    await expect(pg.query('select public.admin_set_featured_templates($1)', [[A, HIDDEN]])).rejects.toThrow(/published web templates/)
    await expect(pg.query('update public.templates set featured_rank = 5 where id = $1', [HIDDEN])).rejects.toThrow(/templates_featured_live_check/)
    expect(await ranks()).toMatchObject({ [A]: 1, [C]: 2, [B]: 3, [HIDDEN]: null })
  })

  it('keeps the rank through an ordinary edit, and clears it when the template is unpublished', async () => {
    await saveTemplate(client, ADMIN_ID, { isNew: false, template: { ...template(C), name: 'Renamed' }, prompt }, CREDITS_FLOOR)
    expect((await ranks())[C]).toBe(2)
    await setTemplateActive(client, ADMIN_ID, { id: C, active: false, reason: 'cover is wrong' }, CREDITS_FLOOR)
    expect((await ranks())[C]).toBeNull()
  })

  it('clears the rank when an edit takes the template off the web', async () => {
    await saveTemplate(client, ADMIN_ID, { isNew: false, template: { ...template(B), visibleIn: ['partner'] }, prompt }, CREDITS_FLOOR)
    expect((await ranks())[B]).toBeNull()
    expect((await ranks())[A]).toBe(1)
  })

  it('cannot be called by a signed-in visitor', async () => {
    const { rows } = await pg.query<{ allowed: boolean }>(
      "select has_function_privilege('authenticated', 'public.admin_set_featured_templates(text[])', 'execute') as allowed",
    )
    expect(rows[0]?.allowed).toBe(false)
  })
})

// T76: dragging the featured list saves its whole new order through admin_set_template_order.
// In this file because featured ranks are global: no other test file may change them meanwhile.
describe('reordering the featured list', () => {
  let pg: Client
  let admin: string
  const client = serviceClient()
  const order = ['test-feat-o1', 'test-feat-o2', 'test-feat-o3'] as const
  const [O1, O2, O3] = order
  const featured = async () =>
    (await pg.query<{ id: string }>('select id from public.templates where featured_rank is not null order by featured_rank')).rows.map(
      (row) => row.id,
    )

  beforeAll(async () => {
    pg = await connectAdmin()
    admin = await createUser(pg)
    await pg.query("update public.profiles set role = 'admin' where id = $1", [admin])
    for (const id of order) {
      await saveTemplate(client, ADMIN_ID, { isNew: true, template: template(id), prompt }, CREDITS_FLOOR)
      await approveFixtures(pg,id)
      await setTemplateActive(client, ADMIN_ID, { id, active: true }, CREDITS_FLOOR)
    }
    await setFeaturedTemplates(client, ADMIN_ID, [...order])
  })

  afterAll(async () => {
    await pg.query('delete from public.templates where id like $1', ['test-feat-o%'])
    await pg.end()
  })

  it('stores the new order in one call', async () => {
    await setTemplateOrder(client, admin, { group: 'featured', ids: [O3, O1, O2] })
    expect(await featured()).toEqual([O3, O1, O2])
  })

  it('refuses a missing id, an extra id and a repeat, changing nothing', async () => {
    await expect(setTemplateOrder(client, admin, { group: 'featured', ids: [O1, O2] })).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(setTemplateOrder(client, admin, { group: 'featured', ids: [O3, O1, O2, HIDDEN] })).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    await expect(pg.query('select public.admin_set_template_order($1, $2, $3)', ['featured', [O3, O3, O1], admin])).rejects.toThrow(
      /INVALID_INPUT/,
    )
    expect(await featured()).toEqual([O3, O1, O2])
  })

  // T79: a batch edit that takes a featured template off the web takes it off the list too.
  it('drops a template from the list when a batch edit makes it partner-only', async () => {
    const outcome = await bulkEditTemplates(client, admin, { ids: [O1], patch: { visibleIn: ['partner'] } }, CREDITS_FLOOR)
    expect(outcome).toEqual({ changed: 1, failures: [] })
    expect(await featured()).toEqual([O3, O2])
  })

  it('refuses a caller who is not an admin, and no client role may call it', async () => {
    const visitor = await createUser(pg)
    await expect(setTemplateOrder(client, visitor, { group: 'featured', ids: [O1, O2, O3] })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(await featured()).toEqual([O3, O2])
    const { rows } = await pg.query<{ auth: boolean; anon: boolean }>(
      `select has_function_privilege('authenticated', 'public.admin_set_template_order(text, text[], uuid)', 'execute') as auth,
              has_function_privilege('anon', 'public.admin_set_template_order(text, text[], uuid)', 'execute') as anon`,
    )
    expect(rows[0]).toEqual({ auth: false, anon: false })
  })
})

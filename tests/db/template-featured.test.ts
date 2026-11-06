import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { saveTemplate, setFeaturedTemplates, setTemplateActive } from '@/core/admin'
import { listTemplatesIn } from '@/core/templates'

import { CREDITS_FLOOR } from '@/modules/image/credits-floor'

import { connectAdmin } from './helpers'
import { serviceSupabase as serviceClient } from './supabase-env'

// T53 (ARCHITECTURE §12 home item 3): the home featured list, chosen and ordered in admin.
const ADMIN_ID = '00000000-0000-0000-0000-000000000001'
const ids = ['test-feat-a', 'test-feat-b', 'test-feat-c'] as const
const [A, B, C] = ids
const HIDDEN = 'test-feat-hidden'

const template = (id: string) => ({
  id,
  name: id,
  category: 'test',
  quality: 'high',
  creditsCost: { '1k': 2, '2k': 4, '3k': 6 },
  visibleIn: ['web'],
  fields: { images: { min: 1, max: 1 }, copy: [], aspectRatios: ['1:1'] },
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
    for (const id of ids) await setTemplateActive(client, ADMIN_ID, { id, active: true })
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
    await setTemplateActive(client, ADMIN_ID, { id: C, active: false, reason: 'cover is wrong' })
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

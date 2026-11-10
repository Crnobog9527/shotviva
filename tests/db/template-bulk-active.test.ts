import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { saveTemplate, setFeaturedTemplates, setTemplatesActive } from '@/core/admin'
import { listTemplatesIn } from '@/core/templates'

import { CREDITS_FLOOR } from '@/modules/image/credits-floor'

import { connectAdmin, approveFixtures } from './helpers'
import { serviceSupabase as serviceClient } from './supabase-env'

// T60: bulk 上架 / 下架 in /admin/templates, against the real tables.
const ADMIN_ID = '00000000-0000-0000-0000-000000000001'
const [A, B, NO_COVER] = ['test-bulk-a', 'test-bulk-b', 'test-bulk-nocover']

const template = (id: string, covers = true) => ({
  id,
  name: id,
  description: 'Bulk test.',
  category: 'pets',
  quality: 'high',
  creditsCost: { '1k': 2, '2k': 4, '3k': 6 },
  visibleIn: ['web'],
  fields: { images: { min: 1, max: 1 }, copy: [], aspectRatios: ['1:1'] },
  ...(covers
    ? { coverBeforeUrl: `https://assets.test/covers/${id}/b.webp`, coverAfterUrl: `https://assets.test/covers/${id}/a.webp` }
    : {}),
})
const prompt = { body: 'one', modelParams: {} }

describe('bulk publish / unpublish', () => {
  let pg: Client
  const client = serviceClient()
  const state = async () => {
    const { rows } = await pg.query<{ id: string; is_active: boolean; featured_rank: number | null }>(
      'select id, is_active, featured_rank from public.templates where id like $1 order by id',
      ['test-bulk-%'],
    )
    return Object.fromEntries(rows.map((row) => [row.id, { active: row.is_active, rank: row.featured_rank }]))
  }

  beforeAll(async () => {
    pg = await connectAdmin()
    for (const id of [A, B]) await saveTemplate(client, ADMIN_ID, { isNew: true, template: template(id), prompt }, CREDITS_FLOOR)
    await saveTemplate(client, ADMIN_ID, { isNew: true, template: template(NO_COVER, false), prompt }, CREDITS_FLOOR)
    await approveFixtures(pg,A,B,NO_COVER)
  })

  afterAll(async () => {
    await pg.query('delete from public.templates where id like $1', ['test-bulk-%'])
    await pg.end()
  })

  it('publishes the ready drafts and leaves the one without covers as a draft, with its reason', async () => {
    const outcome = await setTemplatesActive(client, ADMIN_ID, { ids: [A, NO_COVER, B], active: true }, CREDITS_FLOOR)
    expect(outcome.changed.map((item) => item.id)).toEqual([A, B])
    expect(outcome.skipped).toEqual([{ id: NO_COVER, name: NO_COVER, blockers: ['no_cover'] }])
    expect(await state()).toMatchObject({ [A]: { active: true }, [B]: { active: true }, [NO_COVER]: { active: false } })
    const live = (await listTemplatesIn(client, 'en')).map((row) => row.id)
    expect(live).toEqual(expect.arrayContaining([A, B]))
    expect(live).not.toContain(NO_COVER)
  })

  it('unpublishes the batch in one go and drops it from the home featured list', async () => {
    await setFeaturedTemplates(client, ADMIN_ID, [B])
    const outcome = await setTemplatesActive(client, ADMIN_ID, { ids: [A, B, NO_COVER], active: false, reason: 'test' }, CREDITS_FLOOR)
    expect(outcome.changed.map((item) => item.id)).toEqual([A, B])
    expect(outcome.unchanged.map((item) => item.id)).toEqual([NO_COVER])
    expect(await state()).toMatchObject({ [A]: { active: false }, [B]: { active: false, rank: null } })
  })
})

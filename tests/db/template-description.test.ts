import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { listAdminTemplates, saveTemplate } from '@/core/admin'
import { toUpsertArgs } from '@/core/admin/templates/rpc-payload'
import { listTemplatesIn, templateInputSchema } from '@/core/templates'
import { CREDITS_FLOOR } from '@/modules/image/credits-floor'

import { connectAdmin, publishFixture } from './helpers'
import { anonSupabase, serviceSupabase } from './supabase-env'

// templates.description (T52, ARCHITECTURE §5): the English one-liner. The admin save writes and
// clears it, the prompt import leaves it alone, the table caps it at 160, and the web catalogue
// shows it on English pages and on Chinese pages without a Chinese one.
const ADMIN_ID = '00000000-0000-0000-0000-000000000001'
const ID = 'test-t52-description'
const ENGLISH = 'A clean studio shot on white'

const template = {
  id: ID,
  name: 'Test Description',
  category: 'pets',
  quality: 'high',
  creditsCost: { '1k': 2, '2k': 4, '3k': 6 },
  visibleIn: ['web'],
  fields: { images: { min: 1, max: 1 }, copy: [], aspectRatios: ['1:1'] },
}
const prompt = { body: 'test prompt', modelParams: {} }

describe('templates.description', () => {
  let pg: Client
  const service = serviceSupabase()
  const save = (extra: Record<string, unknown>, isNew = false) =>
    saveTemplate(service, ADMIN_ID, { isNew, template: { ...template, ...extra }, prompt }, CREDITS_FLOOR)
  const stored = async () => (await pg.query('select description from public.templates where id = $1', [ID])).rows[0]?.description
  const shown = async (locale: 'en' | 'zh') => (await listTemplatesIn(anonSupabase(), locale)).find((row) => row.id === ID)?.description

  beforeAll(async () => {
    pg = await connectAdmin()
    await save({ description: `  ${ENGLISH}  `, translations: {} }, true)
    await publishFixture(pg, ID)
  }, 120_000)

  afterAll(async () => {
    await pg?.query('delete from public.templates where id = $1', [ID])
    await pg?.end()
  }, 60_000)

  it('stores what the editor saved, trimmed, and shows it in admin', async () => {
    expect(await stored()).toBe(ENGLISH)
    expect((await listAdminTemplates(service)).find((row) => row.id === ID)?.description).toBe(ENGLISH)
  })

  it('keeps it when a save carries none (the prompt import script)', async () => {
    const { error } = await service.rpc('admin_upsert_template', toUpsertArgs(templateInputSchema.parse(template), prompt))
    expect(error).toBeNull()
    expect(await stored()).toBe(ENGLISH)
  })

  it('shows English on /en, and on /zh only while there is no Chinese one', async () => {
    expect(await shown('en')).toBe(ENGLISH)
    expect(await shown('zh')).toBe(ENGLISH)
    await save({ description: ENGLISH, translations: { zh: { description: '白底棚拍' } } })
    expect(await shown('en')).toBe(ENGLISH)
    expect(await shown('zh')).toBe('白底棚拍')
  })

  it('clears it when the editor sends a blank, and then shows nothing where neither is filled in', async () => {
    await save({ description: '', translations: {} })
    expect(await stored()).toBeNull()
    expect(await shown('en')).toBeNull()
    expect(await shown('zh')).toBeNull()
  })

  it('refuses more than 160 characters, in the save and in the table', async () => {
    await expect(save({ description: 'x'.repeat(161) })).rejects.toThrow()
    await expect(pg.query('update public.templates set description = $1 where id = $2', ['x'.repeat(161), ID])).rejects.toThrow(/templates_description_check/)
    await expect(pg.query("update public.templates set description = '' where id = $1", [ID])).rejects.toThrow(/templates_description_check/)
  })
})

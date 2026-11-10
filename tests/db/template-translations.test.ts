import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { listAdminTemplates, saveTemplate } from '@/core/admin'
import { toUpsertArgs } from '@/core/admin/templates/rpc-payload'
import { listTemplatesIn, templateInputSchema } from '@/core/templates'
import { CREDITS_FLOOR } from '@/modules/image/credits-floor'

import { connectAdmin, publishFixture } from './helpers'
import { anonSupabase, serviceSupabase } from './supabase-env'

// templates.translations (T21, ARCHITECTURE §5): the admin save writes it, the prompt import
// leaves it alone, the table check takes enabled languages only, and the web catalogue reads
// the page's language with an English fallback.
const ADMIN_ID = '00000000-0000-0000-0000-000000000001'
const ID = 'test-i18n-poster'

const template = {
  id: ID,
  name: 'Test Poster',
  category: 'pets',
  quality: 'high',
  creditsCost: { '1k': 2, '2k': 4, '3k': 6 },
  visibleIn: ['web'],
  fields: {
    images: { min: 1, max: 1 },
    copy: [
      { key: 'headline', label: 'Headline', required: true, maxLength: 40 },
      { key: 'price', label: 'Price', required: false, maxLength: 12 },
    ],
    aspectRatios: ['1:1'],
  },
}
const zh = { zh: { name: '测试海报', fields: { headline: { label: '标题', placeholder: '例如：周末特价' } } } }
const prompt = { body: 'test prompt', modelParams: {} }

describe('templates.translations', () => {
  let pg: Client
  const service = serviceSupabase()

  beforeAll(async () => {
    pg = await connectAdmin()
    await saveTemplate(service, ADMIN_ID, { isNew: true, template: { ...template, translations: zh }, prompt }, CREDITS_FLOOR)
    await publishFixture(pg, ID)
    // Module imports plus a GoTrue-free save: still slower than the default hook budget on a busy machine.
  }, 120_000)

  afterAll(async () => {
    await pg?.query('delete from public.templates where id = $1', [ID])
    await pg?.end()
  }, 60_000)

  it('stores what the editor saved', async () => {
    const saved = (await listAdminTemplates(service)).find((row) => row.id === ID)
    expect(saved?.translations).toEqual(zh)
  })

  it('keeps it when a save carries none (the prompt import script)', async () => {
    const input = templateInputSchema.parse({ ...template, name: 'Test Poster 2' })
    const { error } = await service.rpc('admin_upsert_template', toUpsertArgs(input, prompt))
    expect(error).toBeNull()
    const { rows } = await pg.query('select name, translations from public.templates where id = $1', [ID])
    expect(rows[0]).toEqual({ name: 'Test Poster 2', translations: zh })
  })

  it('refuses a language that is not enabled, or a language entry that is not an object', async () => {
    await expect(pg.query(`update public.templates set translations = '{"ja": {"name": "x"}}' where id = $1`, [ID])).rejects.toThrow(
      /templates_translations_check/,
    )
    await expect(pg.query(`update public.templates set translations = '{"zh": "x"}' where id = $1`, [ID])).rejects.toThrow(
      /templates_translations_check/,
    )
  })

  it('serves Chinese on /zh and English elsewhere, falling back item by item', async () => {
    const anon = anonSupabase()
    const chinese = (await listTemplatesIn(anon, 'zh')).find((row) => row.id === ID)
    expect(chinese?.name).toBe('测试海报')
    expect(chinese?.fields.copy.map((field) => [field.label, field.placeholder])).toEqual([
      ['标题', '例如：周末特价'],
      ['Price', undefined],
    ])
    const english = (await listTemplatesIn(anon, 'en')).find((row) => row.id === ID)
    expect(english?.name).toBe('Test Poster 2')
  })
})

import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { loadGenerationTemplate } from '@/core/templates'
import { connectAdmin } from './helpers'
import { seedTemplate } from './generation-fixtures'
import { anonSupabase, serviceSupabase } from './supabase-env'

const provider = randomUUID()
const caps = {
  resolutions: ['1k'], aspectRatios: ['1:1'], originalRatio: false,
  providerAspectRatios: ['1:1', '21:9'], minReferences: 0, maxReferences: 3,
  catalogImageCosts: { '1k': 0.01 }, fetchedAt: new Date().toISOString(),
}
let db: Client
let templateId: string

beforeAll(async () => {
  db = await connectAdmin()
  templateId = await seedTemplate(db, { visibleIn: ['web','partner'] })
  await db.query(`insert into public.ai_providers(id,module,label,adapter,model,base_url,resolutions,capabilities)
    values ($1,'image','test model options','openrouter_images','fixture','https://openrouter.ai/api/v1','{1k}',$2)`, [provider, caps])
  await db.query('update public.template_prompts set provider_id = $1 where template_id = $2', [provider, templateId])
})
afterAll(async () => {
  await db.query('delete from public.templates where id=$1',[templateId])
  await db.query('delete from public.ai_providers where id=$1',[provider])
  await db.end()
})

describe('template output options on the Data API', () => {
  it('projects only web choices and preserves the partner subset', async () => {
    const { data, error } = await anonSupabase().from('templates').select('template_image_options,partner_image_aspects').eq('id',templateId).single()
    expect(error).toBeNull()
    expect(data).toEqual({
      template_image_options: { resolutions: ['1k'], aspectRatios: ['1:1'], originalRatio: false },
      partner_image_aspects: ['1:1'],
    })
  })

  it('refuses a direct partner generation when the intersection is empty', async () => {
    const old = await db.query('select fields from public.templates where id=$1', [templateId])
    try {
      await db.query(`update public.templates set fields=jsonb_set(fields,'{aspectRatios}','["16:9"]') where id=$1`,[templateId])
      await expect(loadGenerationTemplate(serviceSupabase(),templateId,'partner')).rejects.toMatchObject({ code: 'MODEL_INPUT_UNSUPPORTED' })
    } finally {
      await db.query('update public.templates set fields=$2 where id=$1',[templateId, old.rows[0].fields])
    }
  })

  it('ignores a forged publication flag when a public role calls the computed field', async () => {
    await db.query('begin')
    try {
      await db.query('update public.templates set is_active=false where id=$1',[templateId])
      await db.query('set local role anon')
      const row = await db.query(`select public.template_image_options(jsonb_populate_record(null::public.templates,$1)) as options`,
        [{ id: templateId, is_active: true }])
      expect(row.rows[0].options).toBeNull()
    } finally {
      await db.query('rollback')
    }
  })
})

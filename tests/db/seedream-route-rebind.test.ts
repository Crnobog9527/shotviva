import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterEach, beforeEach, expect, it } from 'vitest'

import { CREDITS_FLOOR } from '@/modules/image/credits-floor'
import { connectAdmin, createUser } from './helpers'

// 1490: a template bound to an OpenRouter Seedream model (labelled 'openai' by 1440) can be moved to
// the Ark Seedream model in the editor or bulk edit; its profile label follows. A real ChatGPT setup
// still cannot be moved onto Ark that way.
let db: Client
let admin: string
const openrouter = randomUUID()
const ark = randomUUID()
const gpt = randomUUID()
const caps = { resolutions: ['1k', '2k'], aspectRatios: ['1:1'], originalRatio: false, minReferences: 0, maxReferences: 4, fetchedAt: '2026-11-01T00:00:00Z' }

beforeEach(async () => {
  db = await connectAdmin()
  await db.query('begin')
  admin = await createUser(db)
  await db.query("update public.profiles set role='admin' where id=$1", [admin])
  await db.query(`insert into public.ai_providers(id,label,adapter,model,resolutions,capabilities,estimated_image_costs) values
    ($1,'OpenRouter Seedream','openrouter_images','bytedance/seedream-5-0-flash','{1k,2k}',$4,'{"1k":0.01,"2k":0.01}'),
    ($2,'Ark Seedream','ark_images','doubao-seedream-5-0-flash-260915','{1k,2k}',$4,'{"1k":0.01,"2k":0.01}'),
    ($3,'GPT','openai_images','gpt-test','{1k,2k,4k}','{}','{"1k":0.01,"2k":0.01,"4k":0.01}')`, [openrouter, ark, gpt, caps])
})
afterEach(async () => { await db.query('rollback'); await db.end() })

async function template(provider: string, category = 'pets') {
  const id = 'rebind-' + randomUUID().slice(0, 8)
  await db.query(`insert into public.templates(id,name,category,fields,credits_cost,quality,is_active)
    values($1,$1,$2,'{"images":{"min":0,"max":1},"aspectRatios":["1:1"],"copy":[]}','{"1k":120,"2k":120,"4k":120}','medium',false)`, [id, category])
  await db.query('insert into public.template_prompts(template_id,body,provider_id) values($1,$2,$3)', [id, 'fixture', provider])
  return id
}
const state = async (id: string) => ({
  live: (await db.query('select active_profile, provider_id from public.template_prompts where template_id=$1', [id])).rows[0],
  profiles: (await db.query('select profile from public.template_profiles where template_id=$1 order by 1', [id])).rows.map(r => r.profile),
  versions: (await db.query('select distinct profile from public.template_prompt_versions where template_id=$1 order by 1', [id])).rows.map(r => r.profile),
  drift: (await db.query('select * from public.admin_template_profile_drift() where template_id=$1', [id])).rows,
})
async function savepoint<T>(work: () => Promise<T>) {
  await db.query('savepoint sp')
  try { return await work() } catch (error) { await db.query('rollback to savepoint sp'); throw error }
}

it('an OpenRouter Seedream template moves to Ark through the editor write and becomes the Seedream profile', async () => {
  const id = await template(openrouter)
  expect((await state(id)).live.active_profile).toBe('openai')
  await db.query('update public.template_prompts set provider_id=$2 where template_id=$1', [id, ark])
  await db.query('set constraints all immediate')
  expect(await state(id)).toEqual({ live: { active_profile: 'seedream', provider_id: ark }, profiles: ['seedream'], versions: ['seedream'], drift: [] })
})

it('bulk edit moves several OpenRouter Seedream templates to Ark at once', async () => {
  const ids = [await template(openrouter), await template(openrouter)]
  const result = (await db.query('select public.admin_bulk_edit_templates($1,$2,$3,$4,$5) r',
    [ids, { provider_id: ark }, { ...CREDITS_FLOOR, version: 'v2' }, admin, ['en', 'zh']])).rows[0].r
  expect(result).toEqual({ failures: [], changed: 2 })
  await db.query('set constraints all immediate')
  for (const id of ids) expect((await state(id)).live).toEqual({ active_profile: 'seedream', provider_id: ark })
})

it('still refuses moving a real ChatGPT setup onto Ark, and never relabels over a saved Seedream profile', async () => {
  const chat = await template(gpt)
  await expect(savepoint(async () => {
    await db.query('update public.template_prompts set provider_id=$2 where template_id=$1', [chat, ark])
    await db.query('set constraints all immediate')
  })).rejects.toThrow(/PROFILE_PROVIDER_MISMATCH/)

  const both = await template(openrouter)
  const version = (await db.query('select version from public.template_prompts where template_id=$1', [both])).rows[0].version
  await db.query(`select public.admin_save_template_profile($1,$2,'seedream',$3,'medium','{"1k":120,"2k":120,"4k":120}','{4k}',null)`,
    [admin, both, JSON.stringify({ body: 'saved seedream', model_params: {}, provider_id: ark, style_refs: [] })])
  await expect(savepoint(async () => {
    await db.query('update public.template_prompts set provider_id=$2 where template_id=$1', [both, ark])
    await db.query('set constraints all immediate')
  })).rejects.toThrow(/PROFILE_PROVIDER_MISMATCH/)
  expect((await db.query('select version from public.template_prompts where template_id=$1', [both])).rows[0].version).toBe(version)
})

it('moving between ChatGPT models or between Ark models leaves the label alone', async () => {
  const chat = await template(gpt)
  await db.query('update public.template_prompts set provider_id=null where template_id=$1', [chat])
  const seed = await template(ark)
  const otherArk = randomUUID()
  await db.query(`insert into public.ai_providers(id,label,adapter,model,resolutions,capabilities,estimated_image_costs)
    values($1,'Ark 2','ark_images','doubao-seedream-5-5-261028','{1k,2k}',$2,'{"1k":0.01,"2k":0.01}')`, [otherArk, caps])
  await db.query('update public.template_prompts set provider_id=$2 where template_id=$1', [seed, otherArk])
  await db.query('set constraints all immediate')
  expect((await state(chat)).live.active_profile).toBe('openai')
  expect((await state(seed)).live.active_profile).toBe('seedream')
})

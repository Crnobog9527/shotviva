import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, expect, it } from 'vitest'

import { toDbTiers } from '../../src/core/templates/db-resolution'
import { readTemplateQuote } from '../../src/site/template-pricing'
import { connectAdmin, createUser, serviceClient } from './helpers'
import { serviceSupabase } from './supabase-env'

// 1393: T93 carries both provider profiles and which one is live. Calls go through PostgREST with
// the service role key, as the sync workflow does.

const gptId = randomUUID()
const arkId = randomUUID()
const gpt = { adapter: 'openai_images', model: `gpt-${gptId}`, base_url: 'https://model.example.test' }
const ark = { adapter: 'ark_images', model: `ark-${arkId}`, base_url: 'https://ark.example.test' }
const id = 't93-prof-' + randomUUID().slice(0, 8)
const cost = { '1k': 120, '2k': 240, '3k': 360 }
let db: Awaited<ReturnType<typeof connectAdmin>>
let categoryKey: string
let actor: string

const template = () => ({ id, module: 'image', name: 'QA', description: 'QA', category_key: categoryKey,
  fields: { images: { min: 0, max: 1 }, copy: [], aspectRatios: ['1:1'] }, translations: { zh: { name: '测试' } },
  quality: 'medium', credits_cost: cost, visible_in: ['web'], cover_media_type: 'image',
  cover_before_url: 'https://example.test/b', cover_after_url: 'https://example.test/a', cover_locales: {} })
const entry = (profile: string, body: string, provider: object | null) => ({ profile, body, model_params: {}, style_refs: [],
  provider, quality: 'medium', credits_cost: cost, unpriced_resolutions: profile === 'seedream' ? ['3k'] : [] })

async function sync(run: string, active: 'openai' | 'seedream', body: string, inactive: object[]) {
  const target = await serviceClient().rpc('read_template_sync_target', { p_id: id, p_run_id: run })
  expect(target.error).toBeNull()
  const { floors, receipt, envModel } = await readTemplateQuote(serviceSupabase())
  return serviceClient().rpc('sync_preview_template', {
    p_template: template(), p_prompt: { body, version: 1, model_params: {}, style_refs: [] }, p_provider: active === 'seedream' ? ark : gpt,
    p_floors: toDbTiers({ ...floors, quote_receipt: receipt, env_model: envModel }), p_run_id: run, p_locales: ['en', 'zh'],
    p_target_token: (target.data as { token: string }).token, p_catalog_version: 'v1',
    p_profiles: { active, inactive }, p_validate_only: false,
  })
}
const profiles = async () => (await db.query(`select p.profile, v.body, p.provider_unmatched is not null as unmatched
  from public.template_profiles p join public.template_prompt_versions v on v.template_id=p.template_id and v.version=p.prompt_version
  where p.template_id=$1 order by 1`, [id])).rows
const active = async () => (await db.query('select active_profile, body from public.template_prompts where template_id=$1', [id])).rows[0]

beforeAll(async () => {
  db = await connectAdmin()
  actor = await createUser(db)
  await db.query("update public.profiles set role='admin' where id=$1", [actor])
  await db.query(`insert into public.ai_providers(id,adapter,model,base_url,label,resolutions,estimated_image_costs,capabilities) values
    ($1,$2,$3,$4,'sync gpt fixture','{1k,2k,3k}','{"1k":0.01,"2k":0.01,"3k":0.01}','{}')`, [gptId, gpt.adapter, gpt.model, gpt.base_url])
  const { rows } = await db.query('select key from public.template_categories where not is_system and key<>$1 order by key limit 1', ['art-styles'])
  categoryKey = rows[0].key
})
afterAll(async () => {
  await db.query('delete from public.templates where id=$1', [id])
  await db.query('delete from public.ai_providers where id = any($1::uuid[])', [[gptId, arkId]])
  await db.end()
})

it('syncs the inactive profile marked when production lacks its model, then lands each profile in its own row', async () => {
  expect((await sync('first', 'openai', 'GPT body', [entry('seedream', 'Seedream body', ark)])).error).toBeNull()
  expect(await active()).toEqual({ active_profile: 'openai', body: 'GPT body' })
  expect(await profiles()).toEqual([
    { profile: 'openai', body: 'GPT body', unmatched: false },
    { profile: 'seedream', body: 'Seedream body', unmatched: true },
  ])
  const refused = await serviceClient().rpc('admin_switch_template_profiles', { p_actor: actor, p_ids: [id], p_target: 'seedream', p_reason: 'test', p_validate_only: true })
  expect(refused.data).toEqual([expect.objectContaining({ ok: false, code: 'PROVIDER_MISSING' })])

  // Production gets the Ark model; the test site switched to Seedream.
  await db.query(`insert into public.ai_providers(id,adapter,model,base_url,label,resolutions,estimated_image_costs,capabilities) values
    ($1,$2,$3,$4,'sync ark fixture','{1k,2k}','{"1k":0.01,"2k":0.01}',$5)`, [arkId, ark.adapter, ark.model, ark.base_url,
    JSON.stringify({ resolutions: ['1k', '2k'], aspectRatios: ['1:1'], originalRatio: true, minReferences: 0, maxReferences: 10, fetchedAt: new Date().toISOString() })])
  const second = await sync('second', 'seedream', 'Seedream body 2', [entry('openai', 'GPT body', gpt)])
  expect(second.error).toBeNull()
  expect(await active()).toEqual({ active_profile: 'seedream', body: 'Seedream body 2' })
  expect(await profiles()).toEqual([
    { profile: 'openai', body: 'GPT body', unmatched: false },
    { profile: 'seedream', body: 'Seedream body 2', unmatched: false },
  ])
  expect((await serviceClient().rpc('admin_template_profile_drift', {})).data).not.toContainEqual(expect.objectContaining({ template_id: id }))
})

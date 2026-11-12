import { randomUUID } from 'node:crypto'

import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'

import { readTemplateQuote } from '../../src/site/template-pricing'
import { connectAdmin, serviceClient } from './helpers'
import { serviceSupabase } from './supabase-env'

// 1277: how sync_preview_template picks the target's model row for the source's adapter, model and
// endpoint. Calls go through PostgREST with the service role key, as the sync workflow does.

const prompt = { body: 'QA provider match', version: 3, model_params: {} }
const templateIds: string[] = []
const providerIds: string[] = []
let db: Awaited<ReturnType<typeof connectAdmin>>
let categoryKey: string
let previousActive: string | null = null

const triple = () => ({ adapter: 'openai_images', model: 'match-' + randomUUID(), base_url: 'https://model.example.test' })
async function provider(binding: ReturnType<typeof triple>, label: string) {
  const id = randomUUID()
  providerIds.push(id)
  await db.query('insert into public.ai_providers(id,adapter,model,base_url,label) values ($1,$2,$3,$4,$5)',
    [id, binding.adapter, binding.model, binding.base_url, label])
  return id
}
// At most one active image provider (ai_providers_one_active_per_module): hand the flag over, and back after.
async function activate(id: string) {
  const { rows } = await db.query("update public.ai_providers set is_active=false where module='image' and is_active returning id")
  previousActive ??= rows[0]?.id ?? null
  await db.query('update public.ai_providers set is_active=true where id=$1', [id])
}

function fixture() {
  const id = 't93-match-' + randomUUID()
  templateIds.push(id)
  return { id, module: 'image', name: 'QA', description: 'QA', category_key: categoryKey,
    fields: { images: { min: 0, max: 1 }, copy: [], aspectRatios: ['1:1'] },
    translations: { zh: { name: '测试' } }, quality: 'medium', credits_cost: { '1k': 1, '2k': 2, '3k': 3 },
    visible_in: ['web'], cover_media_type: 'image', cover_before_url: 'https://example.test/b',
    cover_after_url: 'https://example.test/a', cover_locales: {},
  }
}

async function sync(binding: ReturnType<typeof triple>) {
  const template = fixture()
  const target = await serviceClient().rpc('read_template_sync_target', { p_id: template.id, p_run_id: '1' })
  expect(target.error).toBeNull()
  const { floors, receipt, envModel } = await readTemplateQuote(serviceSupabase())
  const result = await serviceClient().rpc('sync_preview_template', {
    p_template: template, p_prompt: prompt, p_provider: binding,
    p_floors: { ...floors, quote_receipt: receipt, env_model: envModel }, p_run_id: '1',
    p_locales: ['en', 'zh'], p_target_token: (target.data as { token: string }).token, p_catalog_version: 'v1',
  })
  const bound = (await db.query('select provider_id from public.template_prompts where template_id=$1', [template.id])).rows[0]
  return { error: result.error, providerId: (bound?.provider_id as string | undefined) ?? null }
}

beforeAll(async () => {
  db = await connectAdmin()
  const { rows } = await db.query('select key from public.template_categories where not is_system order by key limit 1')
  categoryKey = rows[0].key
})
afterEach(async () => {
  await db.query("update public.ai_providers set is_active=false where module='image' and is_active and id=any($1::uuid[])", [providerIds])
  if (previousActive) await db.query('update public.ai_providers set is_active=true where id=$1', [previousActive])
  previousActive = null
})
afterAll(async () => {
  await db.query('delete from public.templates where id = any($1::text[])', [templateIds])
  await db.query('delete from public.ai_providers where id = any($1::uuid[])', [providerIds])
  await db.end()
})

it('uses the one matching row, active or not', async () => {
  const binding = triple()
  const only = await provider(binding, 'only')
  expect(await sync(binding)).toEqual({ error: null, providerId: only })
})

it('of several rows with the same adapter, model and endpoint, uses the active provider', async () => {
  const binding = triple()
  await provider(binding, 'older copy')
  const active = await provider(binding, 'in use')
  await activate(active)
  expect(await sync(binding)).toEqual({ error: null, providerId: active })
})

it('refuses several matching rows when none is the active provider, and writes nothing', async () => {
  const binding = triple()
  await provider(binding, 'copy a')
  await provider(binding, 'copy b')
  const result = await sync(binding)
  expect(result.error?.message).toBe('PROVIDER_NOT_UNIQUE')
  expect(result.providerId).toBeNull()
})

it('reports a model production does not have as PROVIDER_MISSING', async () => {
  const result = await sync(triple())
  expect(result.error?.message).toBe('PROVIDER_MISSING')
  expect(result.providerId).toBeNull()
})

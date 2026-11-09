import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, expect, it } from 'vitest'

import { CREDITS_FLOOR } from '../../src/modules/image/credits-floor'
import { anonClient, connectAdmin, serviceClient } from './helpers'

const id = 't93-' + randomUUID()
const catalog = { id, module: 'image', name: 'QA', description: 'QA', category_key: 'pets',
  fields: { images: { min: 0, max: 1 }, copy: [], aspectRatios: ['1:1'] },
  translations: { zh: { name: '测试' } }, quality: 'medium', credits_cost: { '1k': 1, '2k': 2, '3k': 3 },
  visible_in: ['web'], cover_media_type: 'image', cover_before_url: 'https://example.test/b',
  cover_after_url: 'https://example.test/a', cover_locales: { zh: { after: 'https://example.test/zh' } },
  is_active: true, sort_order: 123, featured_rank: 1,
}
const binding = { adapter: 'openai_images', model: id, base_url: 'https://model.example.test' }
const providerId = randomUUID()
const floors = { ...CREDITS_FLOOR, providers: { [providerId]: CREDITS_FLOOR }, models: { [providerId]: id } }
const args = { p_template: catalog, p_prompt: { body: 'QA fixture', version: 77, model_params: { test: true } },
  p_provider: binding, p_run_id: '1', p_floors: floors, p_locales: ['en', 'zh'] }
const rpc = (overrides: Record<string, unknown> = {}) => serviceClient().rpc('sync_preview_template', { ...args, ...overrides })
let db: Awaited<ReturnType<typeof connectAdmin>>
beforeAll(async () => {
  db = await connectAdmin()
  await db.query("insert into public.ai_providers(id,adapter,model,base_url,label) values ($1,$2,$3,$4,'sync fixture')",
    [providerId, binding.adapter, binding.model, binding.base_url])
  const { rows } = await db.query('select key from public.template_categories where not is_system order by key limit 1')
  catalog.category_key = rows[0].key
})
afterAll(async () => {
  await db.query('delete from public.templates where id=$1', [id])
  await db.query('delete from public.ai_providers where id=$1', [providerId])
  await db.end()
})

it('validates, drafts, preserves live order, archives and replays concurrent attempts exactly once', async () => {
  expect(await rpc({ p_validate_only: true })).toEqual({ data: 1, error: null })
  expect((await db.query('select 1 from public.templates where id=$1', [id])).rowCount).toBe(0)
  expect(await rpc()).toEqual({ data: 1, error: null })
  expect((await db.query('select is_active,sort_order,featured_rank,cover_locales from public.templates where id=$1', [id])).rows[0])
    .toMatchObject({ is_active: false, sort_order: expect.any(Number), featured_rank: null, cover_locales: catalog.cover_locales })
  await db.query('update public.templates set is_active=true,sort_order=432 where id=$1', [id])
  const changed = { ...catalog, name: 'QA updated' }
  const options = { p_template: changed, p_run_id: '2' }
  expect(await Promise.all([rpc(options), rpc(options)])).toEqual([{ data: 2, error: null }, { data: 2, error: null }])
  expect((await db.query('select is_active,sort_order,name from public.templates where id=$1', [id])).rows[0])
    .toEqual({ is_active: true, sort_order: 432, name: 'QA updated' })
  expect((await db.query('select previous_version,previous_body,previous_model_params,source_version from public.template_sync_history where template_id=$1 and run_id=$2', [id, '2'])).rows[0])
    .toEqual({ previous_version: 1, previous_body: args.p_prompt.body, previous_model_params: { test: true }, source_version: 77 })
  expect(await rpc({ p_run_id: '3', p_prompt: { ...args.p_prompt, body: 'QA changed' } })).toEqual({ data: 3, error: null })
})

it('refuses invalid destination data without committing any row', async () => {
  const invalid = { ...catalog, id: id + '-invalid' }
  const cases = [
    [{ p_template: { ...invalid, category_key: 'missing-' + id } }, 'CATEGORY_MISSING'],
    [{ p_template: { ...invalid, quality: 'high' } }, 'MODEL_CREDIT_FLOOR'],
    [{ p_template: invalid, p_provider: { adapter: 'openai_images', model: id, base_url: 'https://example.test' } }, 'PROVIDER_NOT_UNIQUE'],
    [{ p_template: { ...invalid, cover_media_type: 'video' } }, 'templates_cover_motion_complete'],
  ] as const
  for (const [overrides, reason] of cases) expect((await rpc(overrides)).error?.message).toContain(reason)
  expect((await db.query('select 1 from public.templates where id=$1', [invalid.id])).rowCount).toBe(0)
})

it('denies client access to the write RPC and private history', async () => {
  expect((await anonClient().rpc('sync_preview_template', args)).error).toBeTruthy()
  expect((await anonClient().select('template_sync_history')).ok).toBe(false)
  for (const role of ['anon', 'authenticated']) {
    const { rows } = await db.query(`select has_table_privilege($1, 'public.template_sync_history','SELECT') as read,
      has_function_privilege($1,'public.sync_preview_template(jsonb,jsonb,jsonb,jsonb,text,text[],boolean)','EXECUTE') as write`, [role])
    expect(rows[0]).toEqual({ read: false, write: false })
  }
})

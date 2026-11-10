import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, expect, it, vi } from 'vitest'

import { readTemplateQuote } from '../../src/site/template-pricing'
import { anonClient, connectAdmin, serviceClient } from './helpers'
import { serviceSupabase } from './supabase-env'

const providerId = randomUUID()
const binding = { adapter: 'openai_images', model: providerId, base_url: 'https://model.example.test' }
const prompt = { body: 'QA fixture', version: 77, model_params: { test: true } }
const templateIds: string[] = []
let db: Awaited<ReturnType<typeof connectAdmin>>
let categoryKey: string

function fixture() {
  const id = 't93-' + randomUUID()
  templateIds.push(id)
  return { id, module: 'image', name: 'QA', description: 'QA', category_key: categoryKey,
    fields: { images: { min: 0, max: 1 }, copy: [], aspectRatios: ['1:1'] },
    translations: { zh: { name: '测试' } }, quality: 'medium', credits_cost: { '1k': 1, '2k': 2, '3k': 3 },
    visible_in: ['web'], cover_media_type: 'image', cover_before_url: 'https://example.test/b',
    cover_after_url: 'https://example.test/a', cover_locales: { zh: { after: 'https://example.test/zh' } },
    is_active: true, sort_order: 123, featured_rank: 1,
  }
}

async function target(id: string, run: string) {
  const result = await serviceClient().rpc('read_template_sync_target', { p_id: id, p_run_id: run })
  expect(result.error).toBeNull()
  return result.data as { token: string; version: number | null }
}

async function prepare(template: ReturnType<typeof fixture>, run: string) {
  const { token } = await target(template.id, run)
  const { floors, receipt, envModel } = await readTemplateQuote(serviceSupabase())
  return { p_template: template, p_prompt: prompt, p_provider: binding,
    p_floors: { ...floors, quote_receipt: receipt, env_model: envModel }, p_run_id: run,
    p_locales: ['en', 'zh'], p_target_token: token, p_catalog_version: 'v1' }
}
const write = (args: Record<string, unknown>) => serviceClient().rpc('sync_preview_template', args)
const source = (id: string) => serviceClient().rpc('read_template_sync_source', { p_id: id })
const ok = (version: number) => ({ data: version, error: null })
const signature = 'public.sync_preview_template(jsonb,jsonb,jsonb,jsonb,text,text[],text,text,boolean)'

// For lock/interleaving tests the caller needs to hold the write transaction open.
function writeSql(client: typeof db, args: Awaited<ReturnType<typeof prepare>>) {
  return client.query('select public.sync_preview_template($1,$2,$3,$4,$5,$6,$7,$8) as version',
    [args.p_template, args.p_prompt, args.p_provider, args.p_floors, args.p_run_id,
      args.p_locales, args.p_target_token, args.p_catalog_version])
}

async function waitForBlockedWriter(pid: number) {
  await vi.waitFor(async () => {
    const { rows } = await db.query('select pg_backend_pid()=any(pg_blocking_pids($1)) as blocked', [pid])
    expect(rows[0].blocked).toBe(true)
  }, { timeout: 3000 })
}

beforeAll(async () => {
  db = await connectAdmin()
  await db.query("insert into public.ai_providers(id,adapter,model,base_url,label) values ($1,$2,$3,$4,'sync fixture')",
    [providerId, binding.adapter, binding.model, binding.base_url])
  const { rows } = await db.query('select key from public.template_categories where not is_system order by key limit 1')
  categoryKey = rows[0].key
})
afterAll(async () => {
  await db.query('delete from public.templates where id = any($1::text[])', [templateIds])
  await db.query('delete from public.ai_providers where id=$1', [providerId])
  await db.end()
})

it('drafts, preserves live order, archives, and returns the committed receipt on a concurrent same-run replay', async () => {
  const template = fixture()
  const initial = await prepare(template, '1')
  expect(await write({ ...initial, p_validate_only: true })).toEqual(ok(1))
  expect((await db.query('select 1 from public.templates where id=$1', [template.id])).rowCount).toBe(0)
  expect(await write(initial)).toEqual(ok(1))
  expect((await db.query('select is_active,sort_order,featured_rank,cover_locales from public.templates where id=$1', [template.id])).rows[0])
    .toMatchObject({ is_active: false, sort_order: expect.any(Number), featured_rank: null, cover_locales: template.cover_locales })
  await db.query('update public.templates set is_active=true,sort_order=432 where id=$1', [template.id])
  const next = await prepare({ ...template, name: 'QA updated' }, '2')
  expect(await Promise.all([write(next), write(next)])).toEqual([ok(2), ok(2)])
  expect((await target(template.id, '2')).version).toBe(2)
  expect((await db.query('select is_active,sort_order,name from public.templates where id=$1', [template.id])).rows[0])
    .toEqual({ is_active: true, sort_order: 432, name: 'QA updated' })
  expect((await db.query('select previous_version,previous_body,previous_model_params,source_version from public.template_sync_history where template_id=$1 and run_id=$2', [template.id, '2'])).rows[0])
    .toEqual({ previous_version: 1, previous_body: prompt.body, previous_model_params: prompt.model_params, source_version: 77 })
  expect(await write({ ...await prepare(template, '3'), p_prompt: { ...prompt, body: 'QA changed' } })).toEqual(ok(3))
})

it.each([false, true])('rejects a stale dispatch after a competing sync (existing template = %s)', async existing => {
  const template = fixture()
  if (existing) expect(await write(await prepare(template, 'seed'))).toEqual(ok(1))
  const older = await prepare(template, 'A')
  const incoming = existing ? 2 : 1
  expect(await write({ ...older, p_validate_only: true })).toEqual(ok(incoming))
  const newer = { ...await prepare({ ...template, name: 'B' }, 'B'), p_prompt: { ...prompt, version: 78 } }
  expect(await write(newer)).toEqual(ok(incoming))
  expect((await write(older)).error?.message).toBe('STALE_TARGET')
  expect((await target(template.id, 'A')).version).toBeNull()
  expect((await source(template.id)).data).toMatchObject({ template: { name: 'B' }, prompt: { version: incoming } })
})

it.each([
  ['config', "update public.templates set description='manually edited' where id=$1"],
  ['model parameters', `update public.template_prompts set model_params='{"manuallyEdited":true}' where template_id=$1`],
  ['model binding only', 'update public.template_prompts set provider_id=null where template_id=$1'],
])('preserves an admin edit to %s made during cover transfer', async (_, edit) => {
  const template = fixture()
  expect(await write(await prepare(template, 'seed'))).toEqual(ok(1))
  const args = await prepare(template, 'A')
  expect(await write({ ...args, p_validate_only: true })).toEqual(ok(2))
  await db.query(edit, [template.id])
  const edited = await source(template.id)
  expect(edited.error).toBeNull()
  expect((await write(args)).error?.message).toBe('STALE_TARGET')
  expect(await source(template.id)).toEqual(edited)
})

it('preserves a concurrent manual insert that was uncommitted when the final write began', async () => {
  const template = fixture()
  const args = await prepare(template, 'A')
  expect(await write({ ...args, p_validate_only: true })).toEqual(ok(1))
  const writer = await connectAdmin()
  try {
    const pid = (await writer.query('select pg_backend_pid() as pid')).rows[0].pid
    await db.query('begin')
    await db.query('insert into public.templates(id,name,category_key) values ($1,$2,$3)', [template.id, 'Manual draft', categoryKey])
    const rejected = expect(writeSql(writer, args)).rejects.toThrow('STALE_TARGET')
    try {
      await waitForBlockedWriter(pid)
    } finally {
      await db.query('commit')
      await rejected
    }
    expect((await db.query('select name from public.templates where id=$1', [template.id])).rows[0]).toEqual({ name: 'Manual draft' })
  } finally {
    await db.query('rollback')
    await writer.end()
  }
})

it('keeps destination style references private and intact across sync and a racing admin edit', async () => {
  const template = fixture()
  expect(await write(await prepare(template, 'seed'))).toEqual(ok(1))
  const args = await prepare(template, 'A')
  const refs = [{ key: `style-refs/${template.id}/${randomUUID()}.webp`, width: 32, height: 32, uploadedAt: new Date().toISOString() }]
  await db.query('update public.template_prompts set style_refs=$2 where template_id=$1', [template.id, JSON.stringify(refs)])
  expect((await write(args)).error?.message).toBe('STALE_TARGET')
  const snapshot = await source(template.id)
  expect(snapshot.error).toBeNull()
  expect(snapshot.data).not.toHaveProperty('prompt.style_refs')
  expect(JSON.stringify(snapshot.data)).not.toContain(refs[0].key)
  const fresh = await prepare(template, 'B')
  expect((await write(fresh)).error).toBeNull()
  expect((await db.query('select style_refs from public.template_prompts where template_id=$1', [template.id])).rows[0].style_refs).toEqual(refs)
})

it('reads the source catalogue, private prompt and binding together; rejects both directions of a version mismatch', async () => {
  const template = fixture()
  expect(await write(await prepare(template, 'seed'))).toEqual(ok(1))
  expect((await source(template.id)).data).toMatchObject({
    catalog: 'v1', template: { id: template.id, credits_cost: template.credits_cost },
    prompt: { body: prompt.body, model_params: prompt.model_params }, provider: binding,
  })
  const args = await prepare(template, 'A')
  expect((await write({ ...args, p_catalog_version: 'v2',
    p_template: { ...template, credits_cost: { '1k': 74, '2k': 150, '3k': 225 } } })).error?.message).toBe('CATALOG_MISMATCH')
  expect(await write({ ...args, p_validate_only: true })).toEqual(ok(2))
  // The changed marker stays in this transaction; parallel CI suites continue to see v1.
  await db.query('begin')
  try {
    await db.query("select pg_advisory_xact_lock(hashtextextended('shotviva.template_catalog',0))")
    await db.query(`insert into public.system_settings(key,value) values ('pricing_catalog_version','"v2"')
      on conflict(key) do update set value=excluded.value`)
    await db.query('update public.templates set credits_cost=$2 where id=$1', [template.id, { '1k': 74, '2k': 150, '3k': 225 }])
    const read = await db.query('select public.read_template_sync_source($1) as snapshot', [template.id])
    expect(read.rows[0].snapshot).toMatchObject({ catalog: 'v2', template: { credits_cost: { '1k': 74, '2k': 150, '3k': 225 } } })
    await expect(writeSql(db, args)).rejects.toThrow('CATALOG_MISMATCH')
  } finally {
    await db.query('rollback')
  }
  expect((await target(template.id, 'A')).version).toBeNull()
})

it('rechecks the quoted model at commit without rejecting another model’s cost update', async () => {
  const template = fixture()
  const otherId = randomUUID()
  await db.query("insert into public.ai_providers(id,adapter,model,label) values ($1,'openai_images',$2,'other sync fixture')", [otherId, otherId])
  try {
    const seed = await prepare(template, 'seed')
    await db.query('update public.ai_providers set estimated_image_costs=$1 where id=$2', [{ '1k': 2 }, otherId])
    expect(await write(seed)).toEqual(ok(1))

    const before = await source(template.id)
    const args = await prepare({ ...template, name: 'should not commit' }, 'A')
    expect(await write({ ...args, p_validate_only: true })).toEqual(ok(2))
    await db.query('update public.ai_providers set estimated_image_costs=$1 where id=$2', [{ '1k': 2 }, providerId])
    expect((await write(args)).error?.message).toBe('PRICE_QUOTE_CHANGED')
    expect(await source(template.id)).toEqual(before)
    expect((await target(template.id, 'A')).version).toBeNull()
    const repriced = await prepare(template, 'retry')
    expect((await write(repriced)).error?.message).toBe('MODEL_CREDIT_FLOOR')
  } finally {
    await db.query("update public.ai_providers set estimated_image_costs='{}' where id=$1", [providerId])
    await db.query('delete from public.ai_providers where id=$1', [otherId])
  }
})

it('holds the catalogue lock through final commit so the cutover cannot leapfrog a validated write', async () => {
  const template = fixture()
  const args = await prepare(template, 'A')
  const cutover = await connectAdmin()
  try {
    const pid = (await cutover.query('select pg_backend_pid() as pid')).rows[0].pid
    await db.query('begin')
    expect((await writeSql(db, args)).rows[0].version).toBe(1)
    const exclusive = cutover.query("select pg_advisory_xact_lock(hashtextextended('shotviva.template_catalog',0))")
    try {
      await waitForBlockedWriter(pid)
    } finally {
      await db.query('rollback')
      await exclusive
    }
  } finally {
    await db.query('rollback')
    await cutover.end()
  }
})

it('refuses invalid destination data without committing any row', async () => {
  const invalid = fixture()
  const args = await prepare(invalid, '1')
  const cases = [
    [{ p_template: { ...invalid, category_key: 'missing-' + invalid.id } }, 'CATEGORY_MISSING'],
    [{ p_template: { ...invalid, quality: 'high' } }, 'MODEL_CREDIT_FLOOR'],
    [{ p_provider: { ...binding, model: 'missing-' + providerId } }, 'PROVIDER_NOT_UNIQUE'],
    [{ p_template: { ...invalid, cover_media_type: 'video' } }, 'templates_cover_motion_complete'],
  ] as const
  for (const [overrides, reason] of cases) expect((await write({ ...args, ...overrides })).error?.message).toContain(reason)
  expect((await db.query('select 1 from public.templates where id=$1', [invalid.id])).rowCount).toBe(0)
})

it('denies client access to snapshots, pricing receipts, the write RPC and private history', async () => {
  const template = fixture()
  const args = await prepare(template, '1')
  const anon = anonClient()
  expect((await anon.rpc('sync_preview_template', args)).error).toBeTruthy()
  expect((await anon.rpc('read_template_sync_source', { p_id: template.id })).error).toBeTruthy()
  expect((await anon.rpc('read_template_sync_target', { p_id: template.id, p_run_id: '1' })).error).toBeTruthy()
  expect((await anon.rpc('template_sync_pricing_input', { p_env_model: binding.model })).error).toBeTruthy()
  expect((await anon.select('template_sync_history')).ok).toBe(false)
  for (const role of ['anon', 'authenticated']) {
    const { rows } = await db.query(`select has_table_privilege($1, 'public.template_sync_history','SELECT') as read,
      has_function_privilege($1,'public.read_template_sync_source(text)','EXECUTE') as source,
      has_function_privilege($1,'public.read_template_sync_target(text,text)','EXECUTE') as target,
      has_function_privilege($1,'public.template_sync_pricing_input(text)','EXECUTE') as quote,
      has_function_privilege($1,$2,'EXECUTE') as write`, [role, signature])
    expect(rows[0]).toEqual({ read: false, source: false, target: false, quote: false, write: false })
  }
})

it('rolls back a live sync and its receipt when the submitted floor understates actual cost', async () => {
  const template = fixture()
  expect(await write(await prepare(template, 'seed'))).toEqual(ok(1))
  await db.query('update public.templates set is_active=true where id=$1', [template.id])
  const before = await source(template.id)
  await db.query('update public.ai_providers set estimated_image_costs=$1 where id=$2', [{ '1k': 10 }, providerId])
  try {
    const args = await prepare({ ...template, credits_cost: { ...template.credits_cost, '1k': 2 } }, 'low')
    const floor = { high: template.credits_cost, medium: template.credits_cost }
    const p_floors = { ...args.p_floors, providers: { ...args.p_floors.providers, [providerId]: floor } }
    expect((await write({ ...args, p_floors })).error?.message).toBe('TEMPLATE_PRICE_BELOW_FLOOR')
    expect(await source(template.id)).toEqual(before)
    expect((await target(template.id, 'low')).version).toBeNull()
  } finally {
    await db.query("update public.ai_providers set estimated_image_costs='{}' where id=$1", [providerId])
  }
})

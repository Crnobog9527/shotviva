import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, expect, it } from 'vitest'

import { readTemplateQuote } from '../../src/site/template-pricing'
import { anonClient, connectAdmin, serviceClient } from './helpers'
import { serviceSupabase } from './supabase-env'

// 1276: T93 carries each template's private style references. Every call goes through PostgREST
// with the service role key, as the sync workflow does.

const providerId = randomUUID()
const binding = { adapter: 'openai_images', model: providerId, base_url: 'https://model.example.test' }
const prompt = { body: 'QA style refs', version: 5, model_params: { test: true } }
const templateIds: string[] = []
let db: Awaited<ReturnType<typeof connectAdmin>>
let categoryKey: string

type Ref = { key: string; width: number; height: number; uploadedAt: string }
const ref = (id: string, width = 64): Ref =>
  ({ key: `style-refs/${id}/${randomUUID()}.webp`, width, height: 48, uploadedAt: new Date().toISOString() })

function fixture(maxPhotos = 1) {
  const id = 't93-refs-' + randomUUID()
  templateIds.push(id)
  return { id, module: 'image', name: 'QA', description: 'QA', category_key: categoryKey,
    fields: { images: { min: 0, max: maxPhotos }, copy: [], aspectRatios: ['1:1'] },
    translations: { zh: { name: '测试' } }, quality: 'medium', credits_cost: { '1k': 1, '2k': 2, '3k': 3 },
    visible_in: ['web'], cover_media_type: 'image', cover_before_url: 'https://example.test/b',
    cover_after_url: 'https://example.test/a', cover_locales: {},
  }
}

async function prepare(template: ReturnType<typeof fixture>, run: string, styleRefs?: unknown) {
  const target = await serviceClient().rpc('read_template_sync_target', { p_id: template.id, p_run_id: run })
  expect(target.error).toBeNull()
  const { floors, receipt, envModel } = await readTemplateQuote(serviceSupabase())
  return { p_template: template, p_prompt: styleRefs === undefined ? prompt : { ...prompt, style_refs: styleRefs },
    // Floors go out in site names (4k): since migration 1451 the database stores 4k too.
    p_provider: binding, p_floors: { ...floors, quote_receipt: receipt, env_model: envModel }, p_run_id: run,
    p_locales: ['en', 'zh'], p_target_token: (target.data as { token: string }).token, p_catalog_version: 'v1' }
}
const write = (args: Record<string, unknown>) => serviceClient().rpc('sync_preview_template', args)
const stored = async (id: string) =>
  (await db.query('select style_refs, version from public.template_prompts where template_id=$1', [id])).rows[0] as
    { style_refs: Ref[]; version: number } | undefined
const history = async (id: string, run: string) =>
  (await db.query('select previous_style_refs from public.template_sync_history where template_id=$1 and run_id=$2', [id, run])).rows[0]

beforeAll(async () => {
  db = await connectAdmin()
  await db.query("insert into public.ai_providers(id,adapter,model,base_url,label) values ($1,$2,$3,$4,'sync refs fixture')",
    [providerId, binding.adapter, binding.model, binding.base_url])
  const { rows } = await db.query('select key from public.template_categories where not is_system order by key limit 1')
  categoryKey = rows[0].key
})
afterAll(async () => {
  await db.query('delete from public.templates where id = any($1::text[])', [templateIds])
  await db.query('delete from public.ai_providers where id=$1', [providerId])
  await db.end()
})

it('adds, reorders and replaces, then removes references as the test site has them, one version per run', async () => {
  const template = fixture()
  const [a, b, c] = [ref(template.id), ref(template.id, 80), ref(template.id, 96)]
  expect(await write(await prepare(template, 'add', [a, b]))).toEqual({ data: 1, error: null })
  expect(await stored(template.id)).toEqual({ style_refs: [a, b], version: 1 })
  expect(await history(template.id, 'add')).toEqual({ previous_style_refs: null })

  expect(await write(await prepare(template, 'update', [c, a]))).toEqual({ data: 2, error: null })
  expect(await stored(template.id)).toEqual({ style_refs: [c, a], version: 2 })
  expect(await history(template.id, 'update')).toEqual({ previous_style_refs: [a, b] })
  // The prompt history keeps the replaced list, so an older version still names b.
  expect((await db.query('select style_refs from public.template_prompt_versions where template_id=$1 order by version', [template.id])).rows)
    .toEqual([{ style_refs: [a, b] }, { style_refs: [c, a] }])

  expect(await write(await prepare(template, 'unchanged', [c, a]))).toEqual({ data: 3, error: null })
  expect(await write(await prepare(template, 'remove', []))).toEqual({ data: 4, error: null })
  expect(await stored(template.id)).toEqual({ style_refs: [], version: 4 })
  expect(await history(template.id, 'remove')).toEqual({ previous_style_refs: [c, a] })
})

it('keeps production references when the payload has no style_refs (an older script)', async () => {
  const template = fixture()
  const refs = [ref(template.id)]
  expect((await write(await prepare(template, 'seed', refs))).error).toBeNull()
  expect((await write(await prepare(template, 'old'))).error).toBeNull()
  expect((await stored(template.id))?.style_refs).toEqual(refs)
})

it.each([
  ['four references', (id: string) => [ref(id), ref(id), ref(id), ref(id)], 1, 'INVALID_STYLE_REFS'],
  ['another template\'s key', () => [ref('someone-else')], 1, 'INVALID_STYLE_REFS'],
  ['a repeated key', (id: string) => { const one = ref(id); return [one, one] }, 1, 'INVALID_STYLE_REFS'],
  ['an oversized reference', (id: string) => [ref(id, 4000)], 1, 'INVALID_STYLE_REFS'],
  ['not a list', () => ({ key: 'x' }), 1, 'INVALID_STYLE_REFS'],
  ['photos plus references over the model limit', (id: string) => [ref(id), ref(id), ref(id)], 2, 'MODEL_REFERENCE_LIMIT'],
])('rejects %s and leaves production as it was', async (_, refs, maxPhotos, reason) => {
  const template = fixture(maxPhotos)
  const kept = [ref(template.id)]
  expect((await write(await prepare(template, 'seed', kept))).error).toBeNull()
  const args = await prepare(template, 'bad', refs(template.id))
  expect((await write({ ...args, p_validate_only: true })).error?.message).toBe(reason)
  expect((await write(args)).error?.message).toBe(reason)
  expect(await stored(template.id)).toEqual({ style_refs: kept, version: 1 })
  expect(await history(template.id, 'bad')).toBeUndefined()
})

it('a validate-only run rolls the references back with everything else', async () => {
  const template = fixture()
  const args = await prepare(template, 'dry', [ref(template.id), ref(template.id)])
  expect(await write({ ...args, p_validate_only: true })).toEqual({ data: 1, error: null })
  expect((await db.query('select 1 from public.templates where id=$1', [template.id])).rowCount).toBe(0)

  const kept = [ref(template.id)]
  expect((await write(await prepare(template, 'seed', kept))).error).toBeNull()
  expect(await write({ ...await prepare(template, 'dry-2', []), p_validate_only: true })).toEqual({ data: 2, error: null })
  expect(await stored(template.id)).toEqual({ style_refs: kept, version: 1 })
  expect(await history(template.id, 'dry-2')).toBeUndefined()
})

it('reads the source references for exactly the prompt version read, for the service role only', async () => {
  const template = fixture()
  const refs = [ref(template.id)]
  expect((await write(await prepare(template, 'seed', refs))).error).toBeNull()
  const read = (version: number) => serviceClient().rpc('read_template_sync_style_refs', { p_id: template.id, p_version: version })
  expect(await read(1)).toEqual({ data: refs, error: null })
  expect((await read(2)).error?.message).toBe('SOURCE_CHANGED')
  expect((await anonClient().rpc('read_template_sync_style_refs', { p_id: template.id, p_version: 1 })).error).not.toBeNull()
  // A signed-in user (the authenticated role) cannot read them either.
  await db.query('begin')
  try {
    await db.query('set local role authenticated')
    await expect(db.query('select public.read_template_sync_style_refs($1, 1)', [template.id])).rejects.toThrow(/permission denied/)
  } finally {
    await db.query('rollback')
  }
  // The main snapshot still leaves them out, so an older script never sees a private key.
  expect(JSON.stringify((await serviceClient().rpc('read_template_sync_source', { p_id: template.id })).data)).not.toContain(refs[0]!.key)
})

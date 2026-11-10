import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { claim, cleanLab, finish, fixture as f, initialiseLab, labDb as api, matrix, save } from './prompt-lab-fixture'

const base = 'https://assets.example.test'
const provider = randomUUID()
const root = 'p3-' + randomUUID().slice(0, 6)
const leaf = root + '-l'
const hex = (n: number) => String(n).repeat(16)
const ids: string[] = []
let runId = ''

function assets(id: string, refs: unknown[] = []) {
  return { cover_before_url: `${base}/covers/${id}/before-${hex(1)}.webp`, cover_after_url: `${base}/covers/${id}/after-${hex(2)}.webp`, style_refs: refs }
}
const styleRef = (id: string) => [{ key: `style-refs/${id}/${randomUUID()}.webp`, width: 1536, height: 1152, uploadedAt: '2026-11-11T00:00:00.000Z' }]
function publish(id: string, extra: Record<string, unknown> = {}) {
  ids.push(id)
  return api.rpc('admin_publish_prompt_lab_run', { p_actor: f.actor, p_run_id: runId,
    p_template: { id, name: 'Lab draft', name_zh: '调试草稿', category: leaf }, p_assets: assets(id, styleRef(id)), p_assets_base: base, ...extra })
}

beforeAll(async () => {
  f.model = provider + '/fixture-model'
  await initialiseLab()
  await f.pg!.query(`insert into public.ai_providers(id,module,adapter,label,model,resolutions,capabilities)
    values($1,'image','openai_images','p3 fixture','fixture-model','{1k,2k,3k}','{"resolutions":["1k","2k","3k"],"minReferences":1,"maxReferences":4}')`, [provider])
  await f.pg!.query("insert into public.template_categories(key,name_en,name_zh,slug) values($1,$1,$1,$1)", [root])
  await f.pg!.query("insert into public.template_categories(key,name_en,name_zh,slug,parent_id,level) values($1,$1,$1,$1,$2,2)", [leaf, root])
  const { data: version } = await save().throwOnError()
  const { data: cells } = await matrix(version).throwOnError()
  runId = cells[0].id
  await claim(runId).throwOnError()
  await finish(runId).throwOnError()
})
afterAll(async () => {
  await f.pg?.query('delete from public.templates where id=any($1)', [ids])
  await f.pg?.query('delete from public.template_categories where key=any($1)', [[leaf, root]])
  await cleanLab()
  const { connectAdmin } = await import('./helpers')
  const pg = await connectAdmin()
  await pg.query('delete from public.ai_providers where id=$1', [provider])
  await pg.end()
})

describe('publish a prompt-lab result as a template draft', () => {
  it('is admin-only, service-role-only, and checks the target id before any copy', async () => {
    const source = (actor: string, id = 'p3-free-' + randomUUID().slice(0, 6)) =>
      api.rpc('admin_prompt_lab_publish_source', { p_actor: actor, p_run_id: runId, p_template_id: id })
    expect((await source(f.user)).error?.message).toBe('NOT_ADMIN')
    expect((await publish('p3-user-' + randomUUID().slice(0, 6), { p_actor: f.user })).error?.message).toBe('NOT_ADMIN')
    await f.pg!.query('update public.profiles set banned_at=now() where id=$1', [f.actor])
    expect((await source(f.actor)).error?.message).toBe('NOT_ADMIN')
    await f.pg!.query('update public.profiles set banned_at=null where id=$1', [f.actor])
    const { data } = await source(f.actor).throwOnError()
    expect(data.run).toMatchObject({ output_key: `prompt-lab/outputs/${runId}.png`, use_style_reference: true, asset: { id: f.asset } })
    expect(JSON.stringify(data)).not.toContain(f.prompt)
    expect((await source(f.actor, 'edit')).error?.message).toBe('TEMPLATE_EXISTS')
    const { rows } = await f.pg!.query(`select proname from pg_proc where proname in ('admin_prompt_lab_publish_source','admin_publish_prompt_lab_run')
      and (has_function_privilege('anon',oid,'execute') or has_function_privilege('authenticated',oid,'execute'))`)
    expect(rows).toEqual([])
  })

  it('rejects bad categories, covers and style images without writing anything', async () => {
    const id = 'p3-bad-' + randomUUID().slice(0, 6)
    const bad = (extra: Record<string, unknown>) => publish(id, extra).then(r => r.error?.message)
    expect(await bad({ p_template: { id, name: 'x', category: 'missing' } })).toBe('INVALID_CATEGORY')
    expect(await bad({ p_assets: { ...assets(id, styleRef(id)), cover_after_url: `${base}/covers/other/after-${hex(2)}.webp` } })).toBe('INVALID_INPUT')
    expect(await bad({ p_assets: assets(id) })).toBe('INVALID_INPUT')
    expect(await bad({ p_assets: assets(id, styleRef('other')) })).toBe('INVALID_INPUT')
    expect((await f.pg!.query('select 1 from public.templates where id=$1', [id])).rowCount).toBe(0)
  })

  it('creates one inactive, closed-for-sale draft with the run’s prompt, model, quality, category and covers, idempotently', async () => {
    const id = 'p3-draft-' + randomUUID().slice(0, 6)
    const [a, b] = await Promise.all([publish(id), publish('p3-race-' + randomUUID().slice(0, 6))])
    const winner = [a.data, b.data].find(r => !r.existing)
    const loser = [a.data, b.data].find(r => r.existing)
    expect(loser.id).toBe(winner.id)
    const { rows: [t] } = await f.pg!.query(`select t.is_active,t.quality,t.category_key,t.subcategory_key,t.cover_after_url,t.translations,
        t.featured_rank,tp.body,tp.provider_id,jsonb_array_length(tp.style_refs) refs,s.enabled,src.asset_id,src.run_id
      from public.templates t join public.template_prompts tp on tp.template_id=t.id
      join public.template_sale_approvals s on s.template_id=t.id join public.reference_template_sources src on src.template_id=t.id
      where t.id=$1`, [winner.id])
    expect(t).toMatchObject({ is_active: false, quality: 'medium', category_key: root, subcategory_key: leaf, featured_rank: null,
      body: f.prompt, provider_id: provider, refs: 1, enabled: false, asset_id: f.asset, run_id: runId, translations: { zh: { name: '调试草稿' } } })
    expect((await publish('p3-again-' + randomUUID().slice(0, 6))).data).toEqual({ id: winner.id, existing: true })
    expect((await api.rpc('admin_prompt_lab_publish_source', { p_actor: f.actor, p_run_id: runId, p_template_id: 'x' }).throwOnError()).data)
      .toEqual({ existing: { id: winner.id } })
  })

  it('refuses unfinished results and results whose model changed', async () => {
    const { data: v } = await save().throwOnError()
    const { data: cells } = await matrix(v).throwOnError()
    const queued = cells[0].id
    const source = (run: string) => api.rpc('admin_prompt_lab_publish_source', { p_actor: f.actor, p_run_id: run, p_template_id: 'p3-q' })
    expect((await source(queued)).error?.message).toBe('RUN_NOT_PUBLISHABLE')
    await claim(queued).throwOnError()
    await finish(queued).throwOnError()
    await f.pg!.query("update public.ai_providers set model='fixture-model-2' where id=$1", [provider])
    expect((await source(queued)).error?.message).toBe('MODEL_CHANGED')
    await f.pg!.query("update public.ai_providers set model='fixture-model' where id=$1", [provider])
  })
})

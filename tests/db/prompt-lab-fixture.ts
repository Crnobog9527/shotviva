import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { connectAdmin, createUser } from './helpers'
import { serviceSupabase } from './supabase-env'

export const labDb = serviceSupabase()
export const fixture = {
  pg: null as Client | null, actor: '', user: '', session: '', asset: randomUUID(), photo: randomUUID(),
  category: 't101-lab', prompt: randomUUID(), settingModel: randomUUID(), model: randomUUID() + '/fixture-model',
  budget: undefined as unknown, settings: undefined as unknown, runs: new Set<string>(),
}
export async function initialiseLab() {
  const pg = await connectAdmin()
  fixture.pg = pg
  fixture.actor = await createUser(pg)
  fixture.user = await createUser(pg)
  await pg.query("update public.profiles set role='admin' where id=$1", [fixture.actor])
  await pg.query("insert into public.template_categories(key,name_en,name_zh,kind) values($1,$1,$1,'reference')", [fixture.category])
  await pg.query(`insert into public.reference_assets(id,category_id,r2_key,width,height,bytes,sha256,created_by)
    values($1,$2,'references/'||$1::text||'.webp',1,1,15,repeat('9',64),$3)`, [fixture.asset, fixture.category, fixture.actor])
  await pg.query("insert into public.admin_test_photos(id,object_key) values($1,'admin-tests/photos/'||$1::text||'.jpg')", [fixture.photo])
  fixture.session = (await labDb.rpc('admin_open_prompt_lab', { p_actor: fixture.actor, p_asset_id: fixture.asset }).throwOnError()).data
  const settings = await pg.query("select key,value from public.system_settings where key=any($1)", [['prompt_lab_reverse', 'admin_test_daily_budget_usd']])
  fixture.settings = settings.rows.find(s => s.key === 'prompt_lab_reverse')?.value
  fixture.budget = settings.rows.find(s => s.key === 'admin_test_daily_budget_usd')?.value
}
export async function cleanLab() {
  const pg = fixture.pg
  if (!pg) return
  for (const [key, value] of [['prompt_lab_reverse', fixture.settings], ['admin_test_daily_budget_usd', fixture.budget]]) {
    if (value === undefined) await pg.query('delete from public.system_settings where key=$1', [key])
    else await pg.query('update public.system_settings set value=$2 where key=$1', [key, JSON.stringify(value)])
  }
  await pg.query("update public.prompt_lab_runs set status='failed',finished_at=now() where session_id=$1 and status in ('queued','running')", [fixture.session])
  await pg.query("update public.prompt_lab_reverse_requests set status='failed',finished_at=now() where session_id=$1 and status='running'", [fixture.session])
  const ids = await pg.query('select id from public.prompt_lab_runs where session_id=$1 union select id from public.prompt_lab_reverse_requests where session_id=$1', [fixture.session])
  for (const row of ids.rows) fixture.runs.add(row.id)
  await pg.query('delete from public.reference_assets where id=$1', [fixture.asset])
  await pg.query('delete from public.reference_object_deletions where r2_key=any($1)', [[...fixture.runs].map(id => 'prompt-lab/outputs/' + id + '.png').concat('references/' + fixture.asset + '.webp')])
  await pg.query('delete from public.admin_test_runs where id=any($1)', [[...fixture.runs]])
  await pg.query('delete from public.admin_test_spend where run_id=any($1)', [[...fixture.runs]])
  await pg.query('delete from public.admin_test_photos where id=$1', [fixture.photo])
  await pg.query('delete from public.admin_test_asset_removals where object_key=$1', ['admin-tests/photos/' + fixture.photo + '.jpg'])
  await pg.query('delete from public.template_categories where key=$1', [fixture.category])
  await pg.query('delete from auth.users where id=any($1)', [[fixture.actor, fixture.user].filter(Boolean)])
  await pg.end()
}
export const save = (id: string | null = null, mode = 'create') => labDb.rpc('admin_save_prompt_lab_version', {
  p_actor: fixture.actor, p_session_id: fixture.session, p_version_id: id, p_mode: mode, p_prompt: fixture.prompt, p_note: null,
})
export const matrix = (version: string, batch = randomUUID(), extra = {}) => labDb.rpc('admin_begin_prompt_lab_matrix', {
  p_actor: fixture.actor, p_session_id: fixture.session, p_batch_id: batch, p_photos: [fixture.photo], p_versions: [version],
  p_model: fixture.model, p_resolution: '1k', p_quality: 'medium', p_use_style_reference: true, p_estimate_usd: 0.01, ...extra,
})
export const claim = (id: string) => labDb.rpc('admin_claim_prompt_lab_run', { p_actor: fixture.actor, p_run_id: id })
export const finish = (id: string, ok = true) => labDb.rpc('admin_finish_prompt_lab_run', {
  p_actor: fixture.actor,
  p_run_id: id, p_status: ok ? 'succeeded' : 'failed', p_output_key: ok ? 'prompt-lab/outputs/' + id + '.png' : null,
  p_error_code: null, p_provider_usage: ok ? { cost: null } : null, p_cost_usd: null
})

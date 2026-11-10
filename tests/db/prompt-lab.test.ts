import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { labDb as api, fixture as f, initialiseLab, cleanLab, save, matrix, claim, finish } from './prompt-lab-fixture'

beforeAll(initialiseLab)
afterAll(cleanLab)

describe('prompt lab private sessions and paid calls', () => {
  it('gates every entry point and resumes the existing session', async () => {
    expect((await api.rpc('admin_open_prompt_lab', { p_actor: f.user, p_asset_id: f.asset })).error?.message).toBe('NOT_ADMIN')
    expect((await api.rpc('admin_open_prompt_lab', { p_actor: f.actor, p_asset_id: f.asset }).throwOnError()).data).toBe(f.session)
    const { rows } = await f.pg!.query(`select proname from pg_proc where pronamespace='public'::regnamespace
      and proname like 'admin%prompt_lab%' and (has_function_privilege('anon',oid,'execute')
      or has_function_privilege('authenticated',oid,'execute'))`)
    expect(rows).toEqual([])
    for (const role of ['anon', 'authenticated']) {
      const { rows } = await f.pg!.query(`select tablename from pg_tables where schemaname='public'
        and tablename like 'prompt_lab_%' and (not rowsecurity or has_table_privilege($1,'public.'||tablename,'select'))`, [role])
      expect(rows).toEqual([])
    }
  })

  it('atomically assigns versions, freezes used prompts, deduplicates the matrix and claims each paid cell once', async () => {
    const { data: first } = await save().throwOnError()
    expect((await save(first, 'edit').throwOnError()).data).toBe(first)
    const { data: copy } = await save(first, 'copy').throwOnError()
    const batch = randomUUID()
    const submit = () => matrix(first, batch, { p_versions: [first, copy] }).throwOnError()
    const [{ data: a }, { data: b }] = await Promise.all([submit(), submit()])
    expect(a).toEqual(b)
    expect(a).toHaveLength(2)
    expect((await matrix(first, batch)).error?.message).toBe('IDEMPOTENCY_CONFLICT')
    expect((await save(first, 'edit').throwOnError()).data).not.toBe(first)
    const cell = await api.from('prompt_lab_runs').select(
      'model,resolution,quality,use_style_reference,estimate_usd,status,admin_test_photos(object_key),' +
      'prompt_lab_versions(version_no,prompt),prompt_lab_sessions(reference_assets(id,width,height,created_at))',
    ).eq('id', a[0].id).single().throwOnError()
    expect(cell.data).toMatchObject({ model: f.model, prompt_lab_versions: { prompt: f.prompt },
      prompt_lab_sessions: { reference_assets: { id: f.asset } } })
    const id = a[0].id as string
    const attempts = await Promise.all([claim(id).throwOnError(), claim(id).throwOnError()])
    expect(attempts.map(r => r.data).sort()).toEqual([false, true])
    await finish(id).throwOnError()
    await finish(id, false).throwOnError()
    expect((await api.from('admin_test_spend').select('counted_usd,cost_usd').eq('run_id', id).single()).data)
      .toEqual({ counted_usd: 0.01, cost_usd: null })
    await api.rpc('admin_mark_prompt_lab_run', { p_actor: f.actor, p_session_id: f.session, p_run_id: id, p_starred: true, p_is_best: true }).throwOnError()
    const photo = await api.rpc('admin_remove_test_assets', { p_actor: f.actor, p_kind: 'photo', p_ids: [f.photo], p_expected: null })
    expect(photo.error?.message).toBe('PHOTO_IN_PROMPT_LAB')
    await f.pg!.query("update public.admin_test_photos set last_used_at=now()-interval '31 days' where id=$1", [f.photo])
    await api.rpc('admin_cleanup_test_runs', { p_actor: f.actor }).throwOnError()
    expect((await api.from('admin_test_photos').select('id').eq('id', f.photo).single()).data?.id).toBe(f.photo)
  })

  it('rejects invalid dimensions and versions before spending', async () => {
    const { data: v } = await save().throwOnError()
    expect((await matrix(v, randomUUID(), { p_photos: Array.from({ length: 13 }, () => randomUUID()) })).error?.message).toBe('INVALID_INPUT')
    expect((await matrix(randomUUID())).error?.message).toBe('PROMPT_VERSION_NOT_FOUND')
    expect((await matrix(v, randomUUID(), { p_photos: [randomUUID()] })).error?.message).toBe('TEST_PHOTO_NOT_FOUND')
  })

  it('serializes T85 and the prompt lab against the last available budget', async () => {
    const { data: v } = await save().throwOnError()
    const { data: before } = await api.rpc('admin_test_budget_status').throwOnError()
    await f.pg!.query(`insert into public.system_settings(key,value) values('admin_test_daily_budget_usd',$1)
      on conflict(key) do update set value=excluded.value`, [Number(before.spent_usd) + 0.5])
    const tid = randomUUID()
    f.runs.add(tid)
    const [lab, t85] = await Promise.all([matrix(v, randomUUID(), { p_estimate_usd: 0.5 }),
    api.rpc('admin_begin_test_run', {
      p_actor: f.actor, p_run_id: tid, p_template_id: 'freeform', p_kind: 'generate',
      p_parent_id: null, p_photo_id: f.photo, p_batch_id: randomUUID(), p_resolution: '1k', p_inputs: {}, p_prompt_version: 1,
      p_provider: f.model, p_estimate_usd: 0.5
    })])
    expect([lab.error?.message ?? 'ok', t85.error?.message ?? 'ok'].sort()).toEqual(['TEST_BUDGET_EXCEEDED', 'ok'])
    await f.pg!.query("update public.system_settings set value='50' where key='admin_test_daily_budget_usd'")
  })

  it('charges one reverse request, rejects stale settings and creates one version on replay', async () => {
    const request = randomUUID()
    f.runs.add(request)
    const instruction = randomUUID()
    await api.rpc('admin_set_prompt_lab_reverse', { p_actor: f.actor, p_model: f.settingModel, p_instruction: instruction }).throwOnError()
    const params = {
      p_actor: f.actor, p_session_id: f.session, p_request_id: request, p_model: f.model,
      p_estimate_usd: 0.01, p_setting_model: f.settingModel, p_instruction: instruction
    }
    expect((await api.rpc('admin_begin_prompt_lab_reverse', { ...params, p_instruction: randomUUID() })).error?.message)
      .toBe('PROMPT_LAB_SETTINGS_CHANGED')
    const submit = () => api.rpc('admin_begin_prompt_lab_reverse', params).throwOnError()
    const attempts = await Promise.all([submit(), submit()])
    expect(attempts.map(r => r.data.claimed).sort()).toEqual([false, true])
    const done = () => api.rpc('admin_finish_prompt_lab_reverse', {
      p_actor: f.actor, p_request_id: request,
      p_prompt: f.prompt, p_error_code: null, p_cost_usd: 0.003, p_submitted: true
    }).throwOnError()
    const settled = await Promise.all([done(), done()])
    expect(settled[0].data).toEqual(settled[1].data)
    expect((await submit()).data).toMatchObject({ claimed: false, status: 'succeeded', version_id: settled[0].data.version_id })
    expect((await api.from('admin_test_spend').select('cost_usd,counted_usd').eq('run_id', request).single()).data)
      .toEqual({ cost_usd: 0.003, counted_usd: 0.003 })
  })

  it('times out stalled jobs without retrying charges and keeps the estimate only if work began', async () => {
    const { data: v } = await save().throwOnError()
    const { data: a } = await matrix(v).throwOnError()
    const { data: b } = await matrix(v).throwOnError()
    await claim(a[0].id).throwOnError()
    await f.pg!.query(`update public.prompt_lab_runs set started_at=now()-interval '11 minutes',
      claimed_at=case when claimed_at is not null then now()-interval '11 minutes' end where id=any($1)`, [[a[0].id, b[0].id]])
    await api.rpc('admin_open_prompt_lab', { p_actor: f.actor, p_asset_id: f.asset }).throwOnError()
    expect((await claim(a[0].id).throwOnError()).data).toBe(false)
    for (const [id, expected] of [[a[0].id, 0.01], [b[0].id, 0]]) {
      const { data } = await api.from('admin_test_spend').select('counted_usd').eq('run_id', id).single().throwOnError()
      expect(data.counted_usd).toBe(expected)
    }
    await api.rpc('admin_finish_prompt_lab_run', { p_actor: f.actor, p_run_id: a[0].id, p_status: 'succeeded',
      p_output_key: 'prompt-lab/outputs/' + a[0].id + '.png', p_error_code: null,
      p_provider_usage: { cost: 0.006 }, p_cost_usd: 0.006 }).throwOnError()
    const receipt = await api.from('admin_test_spend').select('counted_usd,cost_usd,has_openrouter')
      .eq('run_id', a[0].id).single().throwOnError()
    expect(receipt.data).toEqual({ counted_usd: 0.006, cost_usd: 0.006, has_openrouter: true })
  })

  it('rejects deletion during work and queues deterministic output keys without deleting historical spend', async () => {
    const { data: v } = await save().throwOnError()
    const { data: batch } = await matrix(v).throwOnError()
    const id = batch[0].id as string
    await claim(id).throwOnError()
    await api.rpc('admin_bulk_reference_assets', { p_actor: f.actor, p_ids: [f.asset], p_action: 'archive' }).throwOnError()
    const remove = () => api.rpc('admin_bulk_reference_assets', { p_actor: f.actor, p_ids: [f.asset], p_action: 'delete' })
    expect((await remove()).error?.message).toBe('PROMPT_LAB_BUSY')
    await finish(id).throwOnError()
    const { rows } = await f.pg!.query('select id from public.prompt_lab_runs where session_id=$1', [f.session])
    for (const row of rows) f.runs.add(row.id)
    await f.pg!.query("update public.prompt_lab_runs set started_at=now()-interval '11 minutes' where session_id=$1 and status='queued'", [f.session])
    await remove().throwOnError()
    const key = 'prompt-lab/outputs/' + id + '.png'
    expect((await api.from('reference_object_deletions').select('r2_key').eq('r2_key', key).single()).data?.r2_key).toBe(key)
    expect((await api.from('admin_test_spend').select('run_id').eq('run_id', id).single()).data?.run_id).toBe(id)
  })
})

import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { connectAdmin, createUser } from './helpers'

// Provider profiles (1440–1444): the live profile is projected onto the existing columns, every
// write path keeps its row, the inactive profile is saved without touching the site, and the
// switch restores the saved version with the editor's own checks and never unpublishes.
const openai = randomUUID()
const ark = randomUUID()
let db: Client
let actor: string
let id: string

const q = async <T = Record<string, unknown>>(sql: string, args: unknown[] = []) => (await db.query(sql, args)).rows as T[]
const one = async <T = Record<string, unknown>>(sql: string, args: unknown[] = []) => (await q<T>(sql, args))[0]
const live = () => one<{ active_profile: string; version: number; body: string; provider_id: string | null; quality: string; credits_cost: Record<string, number>; is_active: boolean }>(
  `select tp.active_profile, tp.version, tp.body, tp.provider_id, t.quality, t.credits_cost, t.is_active
     from public.template_prompts tp join public.templates t on t.id=tp.template_id where tp.template_id=$1`, [id])
const profile = (name: string) => one<{ prompt_version: number; credits_cost: Record<string, number>; unpriced_resolutions: string[]; provider_unmatched: unknown }>(
  'select * from public.template_profiles where template_id=$1 and profile=$2', [id, name])
const versions = async () => Number((await one<{ n: string }>('select count(*) n from public.template_prompt_versions where template_id=$1', [id])).n)
const drift = () => q('select * from public.admin_template_profile_drift() where template_id=$1', [id])

async function savepoint<T>(work: () => Promise<T>) {
  await db.query('savepoint sp')
  try { return await work() } catch (error) { await db.query('rollback to savepoint sp'); throw error }
}

async function saveSeedream(body = 'Seedream body', cost = { '1k': 80, '2k': 160, '4k': 160 }, expected: number | null = null) {
  return (await one<{ v: number }>(`select public.admin_save_template_profile($1,$2,'seedream',$3,'medium',$4,'{4k}',$5) v`,
    [actor, id, JSON.stringify({ body, model_params: {}, provider_id: ark, style_refs: [] }), JSON.stringify(cost), expected])).v
}
const switchTo = async (target: string, validateOnly = false, ids = [id]) =>
  (await one<{ r: Array<Record<string, unknown>> }>('select public.admin_switch_template_profiles($1,$2,$3,$4,$5) r',
    [actor, ids, target, 'test', validateOnly])).r

beforeEach(async () => {
  db = await connectAdmin()
  await db.query('begin')
  actor = await createUser(db)
  await db.query("update public.profiles set role='admin' where id=$1", [actor])
  await db.query(`insert into public.ai_providers(id,label,adapter,model,resolutions,estimated_image_costs,capabilities) values
    ($1,'GPT fixture','openai_images','gpt-fixture','{1k,2k,4k}','{"1k":0.01,"2k":0.01,"4k":0.01}','{}'),
    ($2,'Ark fixture','ark_images','ark-fixture','{1k,2k}','{"1k":0.01,"2k":0.01}','{"resolutions":["1k","2k"]}')`, [openai, ark])
  await db.query("select public.admin_set_provider_key($1,'test-key-0123456789abcdef'), public.admin_set_provider_key($2,'test-key-0123456789abcdef')", [openai, ark])
  id = `prof-${randomUUID().slice(0, 8)}`
  await db.query(`insert into public.templates (id,name,category,fields,quality,credits_cost,is_active,visible_in)
    values ($1,'Profile fixture','pets',$2,'medium','{"1k":120,"2k":240,"4k":360}',false,array['web'])`,
  [id, JSON.stringify({ images: { min: 0, max: 1 }, copy: [], aspectRatios: ['1:1'] })])
  await db.query(`insert into public.template_prompts(template_id,body,provider_id) values ($1,'GPT body',$2)`, [id, openai])
  await db.query('insert into public.template_sale_approvals(template_id,enabled) values ($1,true)', [id])
  await db.query('update public.templates set is_active=true where id=$1', [id])
})
afterEach(async () => { await db.query('rollback'); await db.end() })

describe('the live profile follows the existing columns', () => {
  it('creates the openai profile on insert and keeps it in step with every write', async () => {
    const before = await live()
    expect(before.active_profile).toBe('openai')
    expect(await profile('openai')).toMatchObject({ prompt_version: before.version, credits_cost: { '1k': 120 } })
    await db.query("update public.template_prompts set body='GPT body 2' where template_id=$1", [id])
    await db.query(`update public.templates set credits_cost='{"1k":130,"2k":240,"4k":360}' where id=$1`, [id])
    await db.query("update public.template_sale_approvals set unpriced_resolutions='{4k}' where template_id=$1", [id])
    const after = await live()
    expect(after.version).toBeGreaterThan(before.version)
    expect(await profile('openai')).toMatchObject({ prompt_version: after.version, credits_cost: { '1k': 130 }, unpriced_resolutions: ['4k'] })
    expect(await drift()).toEqual([])
    expect((await one<{ profile: string }>('select profile from public.template_prompt_versions where template_id=$1 and version=$2', [id, after.version])).profile).toBe('openai')
  })

  it('starts a new prompt bound to an Ark model as the Seedream profile', async () => {
    const other = `prof-ark-${randomUUID().slice(0, 6)}`
    await db.query(`insert into public.templates (id,name,category,quality,credits_cost) values ($1,'Ark','pets','medium','{"1k":120,"2k":240,"4k":360}')`, [other])
    await db.query('insert into public.template_prompts(template_id,body,provider_id) values ($1,$2,$3)', [other, 'Ark body', ark])
    expect((await one<{ active_profile: string }>('select active_profile from public.template_prompts where template_id=$1', [other])).active_profile).toBe('seedream')
    expect(await one('select profile from public.template_profiles where template_id=$1', [other])).toEqual({ profile: 'seedream' })
  })

  it('refuses binding an Ark model to the ChatGPT profile at commit', async () => {
    await expect(savepoint(async () => {
      await db.query('update public.template_prompts set provider_id=$2 where template_id=$1', [id, ark])
      await db.query('set constraints all immediate')
    })).rejects.toThrow(/PROFILE_PROVIDER_MISMATCH/)
  })
})

describe('the inactive profile', () => {
  it('saves as its own tagged version without touching the live template', async () => {
    const before = await live()
    const v = await saveSeedream()
    expect(await live()).toEqual(before)
    expect(v).toBeGreaterThan(before.version)
    expect(await one('select profile, body, provider_id from public.template_prompt_versions where template_id=$1 and version=$2', [id, v]))
      .toEqual({ profile: 'seedream', body: 'Seedream body', provider_id: ark })
    // Same content again: same version. A stale form is refused.
    expect(await saveSeedream('Seedream body', undefined, v)).toBe(v)
    await expect(savepoint(() => saveSeedream('Changed', undefined, null))).rejects.toThrow(/STALE_PROMPT/)
    await expect(savepoint(() => one(`select public.admin_save_template_profile($1,$2,'openai','{"body":"x"}','medium','{"1k":1,"2k":1,"4k":1}','{}',null)`, [actor, id])))
      .rejects.toThrow(/PROFILE_ACTIVE/)
    await expect(savepoint(() => one(`select public.admin_save_template_profile($1,$2,'seedream',$3,'medium','{"1k":1,"2k":1,"4k":1}','{4k}',$4)`,
      [actor, id, JSON.stringify({ body: 'x', provider_id: openai }), v]))).rejects.toThrow(/PROFILE_PROVIDER_MISMATCH/)
  })

  it('protects the version a profile points at from deletion', async () => {
    const v = await saveSeedream()
    await expect(savepoint(() => one("select public.admin_manage_prompt_version($1,$2,$3,'delete')", [actor, id, v]))).rejects.toThrow(/ACTIVE_VERSION/)
  })
})

describe('switching', () => {
  it('switches to Seedream and back without new versions, unpublishing or losing the ChatGPT setup', async () => {
    const gpt = await live()
    const seedream = await saveSeedream()
    const count = await versions()
    const [row] = await switchTo('seedream')
    expect(row).toMatchObject({ ok: true, from: 'openai', to: 'seedream', before: { resolutions: ['1k', '2k', '4k'] }, after: { resolutions: ['1k', '2k'] } })
    expect(await live()).toMatchObject({ active_profile: 'seedream', version: seedream, body: 'Seedream body', provider_id: ark, is_active: true, credits_cost: { '1k': 80 } })
    expect(await drift()).toEqual([])
    const [back] = await switchTo('openai')
    expect(back).toMatchObject({ ok: true, from: 'seedream', to: 'openai' })
    expect(await live()).toEqual(gpt)
    expect(await versions()).toBe(count)
    expect(Number((await one<{ n: string }>('select count(*) n from admin.template_profile_switches where template_id=$1', [id])).n)).toBe(2)
    expect((await switchTo('openai'))[0]).toMatchObject({ ok: true, unchanged: true })
  })

  it('previews without writing, and leaves a template below the floor on its profile, still published', async () => {
    await saveSeedream()
    const before = await live()
    expect((await switchTo('seedream', true))[0]).toMatchObject({ ok: true })
    expect(await live()).toEqual(before)
    await db.query(`update public.ai_providers set estimated_image_costs='{"1k":5,"2k":5}' where id=$1`, [ark])
    expect((await switchTo('seedream'))[0]).toMatchObject({ ok: false, code: 'TEMPLATE_PRICE_BELOW_FLOOR' })
    expect(await live()).toEqual(before)
  })

  it('reports a missing profile, art-style templates and an unmatched production model', async () => {
    expect((await switchTo('seedream'))[0]).toMatchObject({ ok: false, code: 'PROFILE_MISSING' })
    await saveSeedream()
    await db.query(`update public.template_profiles set provider_unmatched='{"adapter":"ark_images","model":"m","base_url":"u"}' where template_id=$1 and profile='seedream'`, [id])
    expect((await switchTo('seedream'))[0]).toMatchObject({ ok: false, code: 'PROVIDER_MISSING' })
    expect(await one('select public.admin_template_profile_scope($1,$2) s', ['category', 'art-styles'])).toEqual({ s: [] })
    expect((await one<{ s: string[] }>("select public.admin_template_profile_scope('site',null) s")).s).toContain(id)
  })

  it('leaves deleted templates (1401) out of the scope, the switch and the profile save', async () => {
    await saveSeedream()
    await db.query('update public.templates set is_active=false where id=$1', [id])
    await db.query('select public.admin_delete_template($1,$2)', [actor, id])
    expect((await one<{ s: string[] }>("select public.admin_template_profile_scope('site',null) s")).s).not.toContain(id)
    expect((await switchTo('seedream'))[0]).toMatchObject({ ok: false, code: 'TEMPLATE_DELETED' })
    const version = (await profile('seedream')).prompt_version
    await expect(savepoint(() => saveSeedream('After delete', undefined, version))).rejects.toThrow(/TEMPLATE_NOT_FOUND/)
  })
})

describe('templates:apply ops', () => {
  it('saves a Seedream profile and switches through the batch function', async () => {
    const ops = [
      { op: 'save_profile', id, profile: 'seedream', quality: 'medium', credits_cost: { '1k': 80, '2k': 160, '4k': 160 }, unpriced_resolutions: ['4k'],
        prompt: { body: 'Apply seedream', model_params: {}, provider_id: ark, style_refs: [] } },
      { op: 'switch_profile', id, profile: 'seedream' },
    ]
    const result = (await one<{ r: unknown }>('select public.admin_apply_template_batch($1,$2,false) r', [actor, JSON.stringify([{ ref: id, ops }])])).r
    expect(result).toEqual([{ ref: id, ok: true }])
    expect(await live()).toMatchObject({ active_profile: 'seedream', body: 'Apply seedream' })
  })
})

describe('T93 sync carries both profiles', () => {
  it('reads the inactive profile on the source and writes it marked when the target has no such model', async () => {
    await saveSeedream()
    const v = (await live()).version
    const read = (await one<{ r: { active: string; inactive: Array<Record<string, unknown>> } }>('select public.read_template_sync_profiles($1,$2) r', [id, v])).r
    expect(read.active).toBe('openai')
    expect(read.inactive).toEqual([expect.objectContaining({ profile: 'seedream', body: 'Seedream body',
      provider: { adapter: 'ark_images', model: 'ark-fixture', base_url: expect.any(String) } })])
    await expect(savepoint(() => one('select public.read_template_sync_profiles($1,$2)', [id, v + 100]))).rejects.toThrow(/SOURCE_CHANGED/)
  })
})

describe('slot floor (1442)', () => {
  const tag = () => `${openai}/gpt-fixture`
  const floor = async (slots: number, single = 10) =>
    (await one<{ f: number }>("select admin.slot_route_floor($1,'1k','medium',$2,$3) f", [tag(), slots, single])).f

  it('is single × slots without data, single + extra inputs with a cost, the full-slot p95 with samples', async () => {
    await db.query("insert into public.system_settings(key,value) values('pricing_catalog_version','\"v2\"') on conflict(key) do update set value=excluded.value")
    expect(await floor(1)).toBe(10)
    expect(await floor(3)).toBe(30)
    await db.query('update public.ai_providers set extra_input_image_usd=0 where id=$1', [openai])
    expect(await floor(3)).toBe(10)
    await db.query('update public.ai_providers set extra_input_image_usd=0.01 where id=$1', [openai])
    const budget = Number((await one<{ b: string }>('select admin.lowest_credit_price()*0.761*0.4 b')).b)
    expect(await floor(3)).toBe(10 + Math.ceil(2 * 0.01 * 1.10 / budget))
    const user = await createUser(db)
    await db.query('set local session_replication_role = replica')
    await db.query(`insert into public.generation_jobs (id,user_id,module,template_id,inputs,provider,source,status,visibility,credits_cost,credit_pool,cost_usd,output_key,finished_at)
      select gen_random_uuid(),$1,'image',$2,$3,$4,'web','succeeded','private',1,'paid',0,'t1442/x',now() from generate_series(1,10)`,
    [user, id, JSON.stringify({ resolution: '1k', quality: 'medium', input_slots: [{ key: 'a' }, { key: 'b' }, { key: 'c' }] }), tag()])
    expect(await floor(3)).toBe(10)
    expect(await floor(2)).toBe(10 + Math.ceil(0.01 * 1.10 / budget))
  })

  it('ignores jobs whose input_slots is an object, a string or null instead of failing (1445)', async () => {
    const user = await createUser(db)
    await db.query('set local session_replication_role = replica')
    for (const slots of [{ logo: 'inputs/u/a.png' }, 'inputs/u/a.png', null]) {
      await db.query(`insert into public.generation_jobs (id,user_id,module,template_id,inputs,provider,source,status,visibility,credits_cost,credit_pool,cost_usd,output_key,finished_at)
        select gen_random_uuid(),$1,'image',$2,$3,$4,'web','succeeded','private',1,'paid',0.5,'t1445/x',now() from generate_series(1,10)`,
      [user, id, JSON.stringify({ resolution: '1k', quality: 'medium', input_slots: slots }), tag()])
    }
    // Every reader of the slot count: the editor's pricing read, the slot floor and the reports that use it.
    await expect(one("select public.template_sync_pricing_input('env-model') r")).resolves.toBeTruthy()
    expect((await one<{ c: Record<string, unknown> }>('select admin.route_slot_costs($1) c', [tag()])).c).toMatchObject({ p95_full: {} })
    expect(await floor(3)).toBe(30)
    await expect(one('select admin.slot_floor_credits(t,$2,$3,10) f from public.templates t where t.id=$1', [id, tag(), '1k'])).resolves.toEqual({ f: 10 })
    await expect(one('select admin.sale_floor_hidden() h')).resolves.toBeTruthy()
    expect((await one<{ n: number | null }>("select admin.slot_count('{\"input_slots\":\"x\"}'::jsonb) n")).n).toBeNull()
  })
})

import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterEach, beforeEach, expect, it } from 'vitest'

import { connectAdmin, createPricedTemplate, createUser } from './helpers'

const provider = randomUUID()
const tag = provider + '/t107-test'
let db: Client
let user: string
let id: string
let other: string

beforeEach(async () => {
  db = await connectAdmin()
  await db.query('begin')
  await db.query("select pg_advisory_xact_lock_shared(hashtextextended('shotviva.template_catalog',0))")
  user = await createUser(db, { credits: 1000 })
  const prices = { '1k': 120, '2k': 240, '3k': 360 }
  id = await createPricedTemplate(db, prices)
  other = await createPricedTemplate(db, prices)
  await db.query(`insert into public.ai_providers(id,label,adapter,model,resolutions,estimated_image_costs)
    values($1,'T107 fixture','openai_images','t107-test','{1k,2k,3k}','{"1k":0.01,"2k":0.01,"3k":0.01}')`, [provider])
  await db.query(`insert into public.template_prompts(template_id,body,provider_id)
    select unnest($1::text[]),'Fixture',$2`, [[id,other], provider])
  await db.query(`insert into public.system_settings(key,value) values('pricing_catalog_version','"v2"')
    on conflict(key) do update set value=excluded.value`)
})
afterEach(async () => { await db.query('rollback'); await db.end() })

const route = (template_id: string, tier: '1k' | '2k' = '1k') => ({
  template_id, resolution: tier, provider: tag, expected_credits: tier === '1k' ? 120 : 240, fallback_route: false,
})
const quote = async (...routes: ReturnType<typeof route>[]) =>
  (await db.query('select public.unavailable_batch_template($1) rejected', [JSON.stringify(routes)])).rows[0].rejected

async function reserve(template: string, tier: '1k' | '2k' = '1k') {
  const r = route(template, tier)
  return db.query(`select credits_cost from public.reserve_credits(
    gen_random_uuid(),$1,'image',$2,$3,'web',jsonb_build_object('resolution',$4::text),$5)`,
  [user, template, r.expected_credits, tier, tag])
}
async function rejectsSubmission(template: string) {
  await db.query('savepoint before_job')
  await expect(reserve(template)).rejects.toThrow('TEMPLATE_UNAVAILABLE')
  await db.query('rollback to before_job')
}

it('identifies the closed template in a mixed batch before debit, and single submission agrees', async () => {
  expect(await quote(route(id), route(other))).toBeNull()
  await db.query('update public.template_sale_approvals set enabled=false where template_id=$1', [other])
  expect(await quote(route(id), route(other))).toBe(other)
  await rejectsSubmission(other)
  expect((await db.query("select 1 from public.credit_ledger where user_id=$1 and kind='reserve'", [user])).rowCount).toBe(0)
  expect((await reserve(id)).rows[0].credits_cost).toBe(120)
})

it('hides a Standard price below the actual model floor and still accepts a valid HD price', async () => {
  await db.query(`update public.ai_providers set estimated_image_costs='{"1k":10,"2k":0.01}' where id=$1`, [provider])
  expect(await quote(route(id))).toBe(id)
  await rejectsSubmission(id)
  expect(await quote(route(id, '2k'))).toBeNull()
  expect((await reserve(id, '2k')).rows[0].credits_cost).toBe(240)
  expect((await db.query('select id from public.web_generation_template($1)', [id])).rows).toEqual([{ id }])
  await db.query('set local role anon')
  expect((await db.query('select id from public.web_templates(p_template_id=>$1)', [id])).rowCount).toBe(0)
  expect((await db.query('select template_id from public.web_catalogue_entries where template_id=$1', [id])).rowCount).toBe(0)
})

it('allows anonymous listing of a sellable template and reserves route checks for the server', async () => {
  await db.query('set local role anon')
  expect((await db.query('select id from public.web_templates(p_template_id=>$1)', [id])).rows).toEqual([{ id }])
  const privs = await db.query(`select role,
    has_function_privilege(role,'public.unavailable_batch_template(jsonb)','execute') as preflight,
    has_function_privilege(role,'public.web_generation_template(text)','execute') as generation
    from unnest(array['anon','authenticated','service_role']) role`)
  expect(privs.rows).toEqual([
    { role: 'anon', preflight: false, generation: false },
    { role: 'authenticated', preflight: false, generation: false },
    { role: 'service_role', preflight: true, generation: true },
  ])
})

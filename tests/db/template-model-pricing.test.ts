import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { connectAdmin, createUser } from './helpers'

const provider = randomUUID()
const id = 't96-price-fixture'
const model = 'vendor/image-v1'
const costs = { '1k': 2, '2k': 4, '3k': 6 }
const template = { id, name: 'T96 fixture', category: 'pets', credits_cost: costs }
const prompt = { body: 'fixture', provider_id: provider }
let db: Client
beforeEach(async () => {
  db = await connectAdmin()
  await db.query('begin')
  const caps = { resolutions: ['1k'], aspectRatios: ['1:1'], originalRatio: false, minReferences: 0, maxReferences: 2, fetchedAt: new Date().toISOString() }
  await db.query(`insert into public.ai_providers (id, module, adapter, label, model, resolutions, capabilities)
    values ($1, 'image', 'openrouter_images', 'T96 pricing', $2, '{1k}', $3)`, [provider, model, caps])
})
afterEach(async () => { await db.query('rollback'); await db.end() })

describe('T96 provider pricing and template saves', () => {
  it('checks the reference limit on create and when an edit keeps its provider override', async () => {
    const save = (max: number, p: Record<string, unknown>) => db.query('select public.admin_upsert_template($1,$2)',
      [{ ...template, fields: { images: { min: 0, max } } }, p])
    await save(2, prompt)
    await expect(save(3, { body: 'fixture' })).rejects.toThrow('MODEL_REFERENCE_LIMIT')
  })
  it('rejects a below-floor tier on the selected provider even if the default floor is lower', async () => {
    const highFloor = { high: { ...costs, '1k': 7 }, medium: costs }
    const price_floors = { high: costs, medium: costs, providers: { [provider]: highFloor } }
    await expect(db.query('select public.admin_upsert_template($1,$2)', [{ ...template, price_floors }, prompt])).rejects.toThrow('MODEL_CREDIT_FLOOR')
  })
  it('compares a batch edit to the bound model and leaves the row unchanged on refusal', async () => {
    const admin = await createUser(db)
    await db.query("update public.profiles set role='admin' where id=$1", [admin])
    await db.query('select public.admin_upsert_template($1,$2)', [template,prompt])
    const floor = { high: costs, medium: costs, providers: { [provider]: { high: { ...costs, '1k': 7 }, medium: costs } }, models: { [provider]: model } }
    const result = await db.query("select public.admin_bulk_edit_templates($1,$2,$3,$4,'{en,zh}') as outcome",
      [[id],{ credits_cost: { '1k': 3 } },floor,admin])
    expect(result.rows[0].outcome.failures).toEqual([expect.objectContaining({ id, reason:'below_floor', floor:7, given:3 })])
    expect((await db.query('select credits_cost from public.templates where id=$1',[id])).rows[0].credits_cost).toEqual(costs)
  })
  it('aggregates paid provider + model + resolution samples from the last 30 days only, at ten completed images', async () => {
    const uid = await createUser(db)
    const tag = provider + '/' + model
    const add = (n: number, cost: number, at: number, res: string, source: string) => db.query(`
      insert into public.generation_jobs(id,user_id,module,template_id,inputs,provider,source,status,visibility,credits_cost,credit_pool,cost_usd,created_at,finished_at,output_key)
      select gen_random_uuid(), $1,'image','freeform', jsonb_build_object('resolution',$2::text),$3,'web','succeeded','public',1,'free',$4,
             now()-make_interval(days=>$5), now()-make_interval(days=>$5),'fixture.png' from generate_series(1,$6)`, [uid,res,source,cost,at,n])
    const stats = async () => (await db.query('select p95 from public.admin_image_provider_pricing($1) where provider_id=$2',['env-model',provider])).rows[0].p95
    await add(9,0.05,1,'1k',tag)
    await add(1,0.30,31,'1k',tag)
    await add(1,0.30,1,'2k',tag)
    await add(1,0.30,1,'1k','env/'+model)
    expect(await stats()).toEqual({})
    await add(1,0.15,1,'1k',tag)
    expect((await stats())['1k']).toBeCloseTo(0.105)
  })
  it.each(['authenticated','anon'])('denies pricing reads and template writes to %s', async role => {
    const grants = await db.query(`select
      has_function_privilege($1,'public.admin_image_provider_pricing(text)','execute') as pricing,
      has_function_privilege($1,'public.admin_upsert_template(jsonb,jsonb)','execute') as saving`,[role])
    expect(grants.rows[0]).toEqual({pricing:false,saving:false})
  })
})

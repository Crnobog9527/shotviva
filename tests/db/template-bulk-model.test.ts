import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterEach, beforeEach, expect, it } from 'vitest'

import { CREDITS_FLOOR } from '@/modules/image/credits-floor'
import { connectAdmin, createUser } from './helpers'

let db: Client
let admin: string
const target = randomUUID()
const costs = { '1k': 120, '2k': 120, '3k': 120 }
const caps = {
  resolutions: ['1k', '2k'], aspectRatios: ['1:1'], originalRatio: false,
  minReferences: 1, maxReferences: 2, fetchedAt: '2026-11-01T00:00:00Z',
}

beforeEach(async () => {
  db = await connectAdmin()
  await db.query('begin')
  admin = await createUser(db)
  await db.query("update public.profiles set role='admin' where id=$1", [admin])
  await db.query(`insert into public.ai_providers(id,label,adapter,model,resolutions,capabilities,estimated_image_costs)
    values($1,'Bulk test','openrouter_images','test/bulk','{1k,2k}',$2,'{"1k":0.01,"2k":0.01}')`, [target, caps])
})

afterEach(async () => { await db.query('rollback'); await db.end() })

async function draft(max = 1, ratio = '1:1', standard = costs['1k']) {
  const id = 'bulk-model-' + randomUUID()
  const fields = { images: { min: 1, max }, aspectRatios: [ratio], copy: [] }
  await db.query(`insert into public.templates(id,name,category,fields,credits_cost,is_active)
    values($1,$1,'pets',$2,$3,false)`, [id, fields, { ...costs, '1k': standard }])
  await db.query("insert into public.template_prompts(template_id,body) values($1,'fixture')", [id])
  return id
}

const apply = async (ids: string[], patch: Record<string, unknown>, floor = CREDITS_FLOOR) =>
  (await db.query('select public.admin_bulk_edit_templates($1,$2,$3,$4,$5) as result',
    [ids, patch, { ...floor, version: 'v2' }, admin, ['en', 'zh']])).rows[0].result

const bindings = async (ids: string[]) =>
  (await db.query('select distinct provider_id from public.template_prompts where template_id=any($1)', [ids])).rows

it('lists every incompatible template and leaves its valid sibling untouched', async () => {
  const valid = await draft()
  const reference = await draft(3)
  const ratio = await draft(1, '4:5')
  const ids = [valid, reference, ratio]
  const { failures } = await apply(ids, { provider_id: target })
  expect(failures).toHaveLength(2)
  expect(failures).toEqual(expect.arrayContaining([
    { id: reference, name: reference, reason: 'model', detail: '用户照片与画风参考图总数超出模型范围' },
    { id: ratio, name: ratio, reason: 'model', detail: '所选模型不支持模板配置的比例' },
  ]))
  expect(await bindings(ids)).toEqual([{ provider_id: null }])
})

it('changes supported prices and bindings together, protects hidden tiers, and can return to the default', async () => {
  const ids = [await draft(), await draft()]
  expect(await apply(ids, { provider_id: target, credits_cost: { '2k': 123 } })).toEqual({ failures: [], changed: 2 })
  expect(await bindings(ids)).toEqual([{ provider_id: target }])
  for (const patch of [{}, { provider_id: target }]) {
    const { failures } = await apply(ids, { ...patch, credits_cost: { '3k': 125 } })
    expect(failures.map((entry: { id: string }) => entry.id).sort()).toEqual([...ids].sort())
  }
  const stored = await db.query('select distinct credits_cost from public.templates where id=any($1)', [ids])
  expect(stored.rows).toEqual([{ credits_cost: { ...costs, '2k': 123 } }])
  expect(await apply(ids, { provider_id: null })).toEqual({ failures: [], changed: 2 })
  expect(await bindings(ids)).toEqual([{ provider_id: null }])
})

it('reports the replacement floor for the cheap template before changing either binding', async () => {
  const cheap = await draft(1, '1:1', 19)
  const ids = [await draft(), cheap]
  const floor = { high: { '1k': 20, '2k': 20, '4k': 1 }, medium: { '1k': 20, '2k': 20, '4k': 1 } }
  const outcome = await apply(ids, { provider_id: target }, floor)
  expect(outcome.failures).toEqual([{ id: cheap, name: cheap, reason: 'below_floor', resolution: '1k', floor: 20, given: 19 }])
  expect(await bindings(ids)).toEqual([{ provider_id: null }])
})

it('rechecks the actual cost of a live model change even with a stale cheap quote', async () => {
  const id = await draft()
  const ids = [id, await draft()]
  await db.query('select public.admin_set_template_sale($1,$2,true)', [admin, id])
  await db.query('update public.templates set is_active=true where id=$1', [id])
  await db.query('set constraints all immediate')
  await db.query(`update public.ai_providers set estimated_image_costs='{"1k":100,"2k":100}' where id=$1`, [target])
  await db.query('savepoint before_change')
  await expect(apply(ids, { provider_id: target })).rejects.toThrow('TEMPLATE_PRICE_BELOW_FLOOR')
  await db.query('rollback to before_change')
  expect(await bindings(ids)).toEqual([{ provider_id: null }])
})

it('keeps a newly supported tier closed until a bulk edit explicitly sets a sufficient price', async () => {
  const id = await draft()
  await apply([id], { provider_id: target })
  await db.query("select admin.set_template_unpriced_resolutions($1,'{3k}')", [id])
  const marked = async () => (await db.query('select unpriced_resolutions from public.template_sale_approvals where template_id=$1', [id])).rows[0].unpriced_resolutions
  await db.query('select public.admin_set_template_sale($1,$2,true)', [admin, id])
  await db.query(`update public.ai_providers set resolutions='{1k,2k,3k}',
    estimated_image_costs=estimated_image_costs || '{"3k":0.01}' where id=$1`, [target])
  // Expanding configured tiers clears the Router snapshot until the next successful sync.
  const price = { credits_cost: { '3k': 120 } }
  expect((await apply([id], price)).failures)
    .toMatchObject([{ id, reason: 'model', detail: '所选模型不支持所填积分档位' }])
  expect((await apply([id], { ...price, provider_id: target })).failures)
    .toMatchObject([{ id, reason: 'model', detail: '所选模型的能力尚未确认' }])
  expect(await marked()).toEqual(['3k'])
  await db.query(`update public.ai_providers set capabilities=$2 where id=$1`, [target, { ...caps, resolutions: ['1k', '2k', '3k'] }])
  expect(await apply([id], { provider_id: target, quality: 'high' })).toEqual({ failures: [], changed: 1 })
  expect(await marked()).toEqual(['3k'])
  expect((await apply([id], { credits_cost: { '3k': 1 } })).failures).toMatchObject([{ resolution: '3k', given: 1 }])
  expect(await marked()).toEqual(['3k'])
  expect(await apply([id], { credits_cost: { '3k': 120 } })).toEqual({ failures: [], changed: 1 })
  expect(await marked()).toEqual([])
  expect((await db.query('select enabled from public.template_sale_approvals where template_id=$1', [id])).rows).toEqual([{ enabled: true }])
  expect((await db.query('select actor_id,enabled from admin.template_sale_events where template_id=$1', [id])).rows)
    .toEqual([{ actor_id: admin, enabled: true }])
})

it('preserves legacy hidden prices when moving to a capable route and leaves no marker on a rejected batch', async () => {
  const id = await draft()
  await db.query('update public.template_prompts set provider_id=$1 where template_id=$2', [target, id])
  await db.query(`update public.templates set credits_cost=credits_cost || '{"3k":1}' where id=$1`, [id])
  const readSale = async () => (await db.query('select enabled,unpriced_resolutions from public.template_sale_approvals where template_id=$1', [id])).rows
  const cheap = await draft(1, '1:1', 1)
  expect((await apply([id,cheap], { provider_id: null })).failures).toMatchObject([{ id: cheap, reason: 'below_floor' }])
  expect(await readSale()).toEqual([])
  expect(await apply([id], { provider_id: null })).toEqual({ failures: [], changed: 1 })
  expect(await readSale()).toEqual([{ enabled: false, unpriced_resolutions: ['3k'] }])
})

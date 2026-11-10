import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterEach, beforeEach, expect, it } from 'vitest'

import { connectAdmin } from './helpers'

const oldPrice = { '1k': 2, '2k': 4, '3k': 6 }
const salePrice = { '1k': 100, '2k': 100, '3k': 100 }
const provider = randomUUID()
let db: Client

beforeEach(async () => {
  db = await connectAdmin()
  await db.query('begin')
  await db.query(`insert into public.ai_providers(id,label,adapter,model,resolutions,estimated_image_costs)
    values($1,'T98','openai_images','t98-c','{1k,2k,3k}','{"1k":0.5,"2k":0.5,"3k":0.5}')`, [provider])
})
afterEach(async () => { await db.query('rollback'); await db.end() })

async function draft(prices: typeof salePrice) {
  const id = 't98-' + randomUUID()
  await db.query("insert into public.templates(id,name,category,credits_cost) values($1,$1,'pets',$2)", [id, prices])
  await db.query("insert into public.template_prompts(template_id,body,provider_id) values($1,'fixture',$2)", [id, provider])
  return id
}

const check = () => db.query('set constraints template_publish_floor, prompt_publish_floor immediate')

it('refuses a batch including an old-price draft and rolls back its valid sibling', async () => {
  const ids = [await draft(salePrice), await draft(oldPrice)]
  await db.query('savepoint before_publish')
  await db.query('update public.templates set is_active=true where id=any($1)', [ids])
  await expect(check()).rejects.toThrow('TEMPLATE_PRICE_BELOW_FLOOR')
  await db.query('rollback to before_publish')
  expect((await db.query('select id from public.templates where id=any($1) and is_active', [ids])).rows).toEqual([])
})

it.each(['1k','2k','3k'])('accepts ordinary publication and refuses a low live %s price', async tier => {
  const id = await draft(salePrice)
  await db.query('update public.templates set is_active=true where id=$1', [id])
  await check()
  await expect(db.query('update public.templates set credits_cost=$2 where id=$1', [id, { ...salePrice, [tier]: 1 }]))
    .rejects.toThrow('TEMPLATE_PRICE_BELOW_FLOOR')
})

it('checks the final binding when the template row is written first', async () => {
  const id = await draft(salePrice)
  const expensive = randomUUID()
  await db.query(`insert into public.ai_providers(id,label,adapter,model,resolutions,estimated_image_costs)
    values($1,'Expensive','openai_images','other','{1k,2k,3k}','{"3k":10}')`, [expensive])
  await db.query('update public.templates set is_active=true where id=$1', [id])
  await db.query('update public.template_prompts set provider_id=$2 where template_id=$1', [id, expensive])
  await expect(check()).rejects.toThrow('TEMPLATE_PRICE_BELOW_FLOOR')
})

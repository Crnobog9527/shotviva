import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { connectAdmin, createUser } from './helpers'

let db: Client
let actor: string
const id = 'import-' + randomUUID()
const provider = randomUUID()
const costs = { '1k': 120, '2k': 240, '3k': 360 }
const payload = {
  id, name: 'Import fixture', category: 'pets', fields: { images: { min: 1, max: 1 } },
  quality: 'medium', credits_cost: costs, visible_in: ['web'],
}

beforeEach(async () => {
  db = await connectAdmin()
  await db.query('begin')
  actor = await createUser(db)
  await db.query("update public.profiles set role='admin' where id=$1", [actor])
  await db.query(`insert into public.ai_providers(id,label,adapter,model,resolutions,estimated_image_costs)
    values($1,'Import fixture','openai_images','fixture','{1k,2k,3k}','{"1k":0.01,"2k":0.01,"3k":0.01}')`, [provider])
})
afterEach(async () => { await db.query('rollback'); await db.end() })

const save = (open: boolean, patch: object = {}, operator: string | null = null, body = 'initial', refs: unknown[] | null = null) =>
  db.query('select public.admin_import_template($1,$2,$3,$4,$5)', [
    { ...payload, ...patch }, { body, model_params: {}, provider_id: provider }, open, operator, refs && JSON.stringify(refs),
  ])
const row = async () => (await db.query(`select t.is_active,p.body,p.style_refs,a.enabled,
  (select count(*)::int from admin.template_sale_events where template_id=t.id and actor_id=$2) as events
  from public.templates t join public.template_prompts p on p.template_id=t.id
  left join public.template_sale_approvals a on a.template_id=t.id where t.id=$1`, [id,actor])).rows[0]

async function refused(work: () => Promise<unknown>, reason: string) {
  await db.query('savepoint failed_import')
  await expect(work()).rejects.toThrow(reason)
  await db.query('rollback to failed_import')
}

it('imports normal drafts unchanged, requires intent for live results and audits an approval once', async () => {
  const ref = { key: `style-refs/${id}/${randomUUID()}.webp`, width: 64, height: 64, uploadedAt: '2026-11-01T00:00:00Z' }
  await save(false, { is_active: false }, null, 'draft', [ref])
  expect(await row()).toEqual({ is_active: false, body: 'draft', style_refs: [ref], enabled: false, events: 0 })
  await refused(() => save(false, { is_active: true }), 'IMPORT_OPEN_SALE_REQUIRED')
  await save(true, {}, actor)
  expect(await row()).toMatchObject({ is_active: false, enabled: true, events: 1, style_refs: [ref] })
  await save(true, { is_active: true }, actor, 'published')
  await db.query('set constraints all immediate')
  await refused(() => save(false, {}, null, 'unintended live change'), 'IMPORT_OPEN_SALE_REQUIRED')
  expect(await row()).toEqual({ is_active: true, body: 'published', style_refs: [ref], enabled: true, events: 1 })
})

it('accepts a new live import in one transaction, including its approval, actor and private prompt', async () => {
  await save(true, { is_active: true }, actor)
  await db.query('set constraints all immediate')
  expect(await row()).toEqual({ is_active: true, enabled: true, body: 'initial', style_refs: [], events: 1 })
})

it('rolls back the entire template when approval fails and denies public roles', async () => {
  const visitor = await createUser(db)
  await refused(() => save(true, {}, visitor), 'FORBIDDEN')
  expect(await row()).toBeUndefined()
  await refused(() => save(true, { credits_cost: { ...costs, '3k': 1 } }, actor), 'TEMPLATE_PRICE_BELOW_FLOOR')
  expect(await row()).toBeUndefined()
  const { rows } = await db.query(`select has_function_privilege('anon',$1,'execute') as anon,
    has_function_privilege('authenticated',$1,'execute') as signed, has_function_privilege('service_role',$1,'execute') as service`,
  ['public.admin_import_template(jsonb,jsonb,boolean,uuid,jsonb)'])
  expect(rows[0]).toEqual({ anon: false, signed: false, service: true })
})

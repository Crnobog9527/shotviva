import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterEach, beforeEach, expect, it } from 'vitest'

import { connectAdmin } from './helpers'

// 1553: the built-in `edit` template honours template_prompts.provider_id (「出图模型」 on
// /admin/templates/edit) in the checks that used to force it onto the active line, and its profile
// label follows the bound line both ways. Everything runs in one rolled-back transaction, under the
// lock the other files that change `edit` take (edit-fixtures.ts).
const EDIT_TEMPLATE_LOCK = 4_710_047
let db: Client
const ark = randomUUID()
const textOnly = randomUUID()
const caps = (max: number) => ({ resolutions: ['1k', '2k'], aspectRatios: ['1:1', '4:3'], originalRatio: true, minReferences: 0, maxReferences: max, fetchedAt: '2026-11-01T00:00:00Z' })

beforeEach(async () => {
  db = await connectAdmin()
  await db.query('select pg_advisory_lock($1)', [EDIT_TEMPLATE_LOCK])
  await db.query('begin')
  // A draft with sale closed: no sale floor applies, so only binding and capabilities are under test.
  await db.query("update public.templates set is_active=false where id='edit'")
  await db.query("update public.template_sale_approvals set enabled=false where template_id='edit'")
  await db.query(`insert into public.ai_providers(id,label,adapter,model,resolutions,capabilities,estimated_image_costs) values
    ($1,'Ark Seedream','ark_images','doubao-seedream-test','{1k,2k}',$3,'{"1k":0.01,"2k":0.01}'),
    ($2,'Text only','ark_images','text-only-test','{1k,2k}',$4,'{"1k":0.01,"2k":0.01}')`, [ark, textOnly, caps(10), caps(0)])
})
afterEach(async () => {
  await db.query('rollback')
  await db.query('select pg_advisory_unlock($1)', [EDIT_TEMPLATE_LOCK])
  await db.end()
})

const bind = async (provider: string | null) => {
  await db.query("update public.template_prompts set provider_id=$1 where template_id='edit'", [provider])
  await db.query('set constraints all immediate')
}
const profile = async () => ({
  live: (await db.query("select active_profile from public.template_prompts where template_id='edit'")).rows[0].active_profile,
  rows: (await db.query("select profile from public.template_profiles where template_id='edit' order by 1")).rows.map(r => r.profile),
  history: (await db.query("select distinct profile from public.template_prompt_versions where template_id='edit' order by 1")).rows.map(r => r.profile),
})
async function options() {
  await db.query('savepoint opt')
  await db.query('set local role service_role')
  const { rows } = await db.query("select public.template_image_options(t) o from public.templates t where t.id='edit'")
  await db.query('rollback to savepoint opt')
  return rows[0].o as { resolutions: string[] }
}

it('binds edit to an Ark line and back without a profile mismatch, the label following the line', async () => {
  await bind(ark)
  expect(await profile()).toEqual({ live: 'seedream', rows: ['seedream'], history: ['seedream'] })
  await bind(null)
  expect(await profile()).toEqual({ live: 'openai', rows: ['openai'], history: ['openai'] })
})

it('offers the sizes of the bound line, and the active line’s when unbound', async () => {
  const unbound = await options()
  await bind(ark)
  expect((await options()).resolutions).toEqual(['1k', '2k'])
  await bind(null)
  expect(await options()).toEqual(unbound)
})

it('checks the one input image against the bound line’s reference range', async () => {
  await db.query('savepoint refs')
  await expect(bind(textOnly)).rejects.toThrow(/MODEL_REFERENCE_LIMIT/)
  await db.query('rollback to savepoint refs')
  await bind(ark)
  await db.query("select admin.assert_template_reference_range('edit')")
})

it('the editor write keeps the stored binding when sent none, and takes the one it is sent', async () => {
  const save = (prompt: Record<string, unknown>) => db.query('select public.admin_upsert_template($1,$2)', [
    { id: 'edit', module: 'image', name: 'Edit', category: 'edit', fields: { images: { min: 1, max: 1 }, copy: [], aspectRatios: ['1:1'] },
      visible_in: [], sort_order: 0, quality: 'medium', credits_cost: { '1k': 900, '2k': 900, '4k': 900 }, is_active: false },
    { body: 'WRAPPER-EDIT', model_params: {}, ...prompt },
  ])
  const binding = async () => (await db.query("select provider_id from public.template_prompts where template_id='edit'")).rows[0].provider_id
  await bind(ark)
  await save({})
  expect(await binding()).toBe(ark)
  await save({ provider_id: null })
  await db.query('set constraints all immediate')
  expect(await binding()).toBeNull()
  expect((await profile()).live).toBe('openai')
})

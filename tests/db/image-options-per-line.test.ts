import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterEach, beforeEach, expect, it } from 'vitest'

import { connectAdmin, createPricedTemplate } from './helpers'

// 1571: template_image_options works out the line-only part once per line per statement. Its
// result must equal the 1554 body (template_image_options_now) for every kind of template.
let db: Client
const openrouter = randomUUID()
const official = randomUUID()

beforeEach(async () => {
  db = await connectAdmin()
  await db.query('begin')
  await db.query("select pg_advisory_xact_lock_shared(hashtextextended('shotviva.template_catalog',0))")
  await db.query(`insert into public.ai_providers(id,label,adapter,model,resolutions,capabilities,estimated_image_costs) values
    ($1,'T1571 routed','openrouter_images','vendor/t1571','{1k,2k}',$3,'{}'),
    ($2,'T1571 official','openai_images','t1571-official','{1k,2k,4k}','{}','{}')`, [openrouter, official,
    { resolutions: ['1k', '2k'], aspectRatios: ['1:1', '16:9', '1:2'], originalRatio: false, minReferences: 0, maxReferences: 4, fetchedAt: '2026-11-15T00:00:00Z' }])
})
afterEach(async () => { await db.query('rollback'); await db.end() })

async function template(line: string | null, fields: object, unpriced?: string[]) {
  const id = await createPricedTemplate(db, { '1k': 500, '2k': 600, '4k': 700 })
  await db.query(`update public.templates set fields=fields || $2::jsonb where id=$1`, [id, JSON.stringify(fields)])
  if (line !== undefined) await db.query('insert into public.template_prompts(template_id,body,provider_id) values($1,$2,$3)', [id, 'x', line])
  if (unpriced) await db.query('update public.template_sale_approvals set unpriced_resolutions=$2 where template_id=$1', [id, unpriced])
  return id
}

const both = (ids: string[]) => db.query(`select t.id, admin.template_image_options(t) new, admin.template_image_options_now(t) old
  from public.templates t where t.id=any($1)`, [ids])

it('equals the 1554 result for every kind of template', async () => {
  const ids = [
    await template(openrouter, {}),
    await template(openrouter, { aspectRatios: ['1:2'] }),
    await template(openrouter, { lockAspectRatios: true, aspectRatios: ['16:9'] }, ['2k']),
    await template(official, {}),
    await template(official, { aspectRatios: ['1:3', '1:1'] }, ['4k']),
    await template(official, { lockAspectRatios: true, aspectRatios: ['9:16'] }),
    await template(null, {}),
  ]
  const { rows } = await both(ids)
  expect(rows).toHaveLength(ids.length)
  for (const r of rows) expect(r.new).toEqual(r.old)
  // The same with the routed line as the default (unbound templates follow it).
  await db.query("update public.ai_providers set is_active=false where module='image'")
  await db.query('update public.ai_providers set is_active=true where id=$1', [openrouter])
  for (const r of (await both(ids)).rows) expect(r.new).toEqual(r.old)
  // And with no active line at all.
  await db.query("update public.ai_providers set is_active=false where module='image'")
  for (const r of (await both(ids)).rows) expect(r.new).toEqual(r.old)
})

it('returns null for an inactive template unless called by the service role', async () => {
  const id = await template(official, {})
  await db.query('update public.templates set is_active=false where id=$1', [id])
  await db.query('set local role anon')
  expect((await db.query('select public.template_image_options(t) o from public.templates t where t.id=$1', [id])).rows).toEqual([])
  await db.query('reset role')
  const r = (await both([id])).rows[0]
  expect(r.new).toEqual(r.old)
})

it('sees a line change made earlier in the same statement', async () => {
  const id = await template(openrouter, {})
  await db.query('create temp table t1571(a jsonb, b jsonb) on commit drop')
  await db.query(`do $$ declare a jsonb; b jsonb; begin
    select admin.template_image_options(t) into a from public.templates t where t.id='${id}';
    update public.ai_providers set resolutions='{1k}', capabilities=jsonb_set(capabilities,'{resolutions}','["1k"]') where id='${openrouter}';
    select admin.template_image_options(t) into b from public.templates t where t.id='${id}';
    insert into t1571 values (a, b);
  end $$`)
  const { a, b } = (await db.query('select a, b from t1571')).rows[0]
  expect(a.resolutions).toEqual(['1k', '2k'])
  expect(b.resolutions).toEqual(['1k'])
})

import { publishFixture } from './helpers'
import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { runGeneration } from '@/core/jobs'
import { handleGenerate } from '@/core/partner'
import { runTestGenerate, saveTestBudget } from '@/modules/image'

import { createMemoryStore } from '../fakes/memory-store'
import { fakeProvider } from './generation-fixtures'
import { connectAdmin, profileOf } from './helpers'
import { linkedUser, partnerRequest, routeDeps } from './partner-fixtures'
import { anonSupabase, serviceSupabase } from './supabase-env'
import { holdTestBudget } from './test-run-fixtures'

const id = 'qa-t97-min-' + randomUUID()
const providerId = randomUUID()
const caps = { resolutions: ['1k'], aspectRatios: ['1:1'], originalRatio: false, minReferences: 1, maxReferences: 2,
  catalogImageCosts: { '1k': 0.01 }, fetchedAt: new Date().toISOString() }
const key = `style-refs/${id}/${randomUUID()}.webp`
const bytes = Uint8Array.of(17,29)
const bucket = createMemoryStore()
let db: Client
let owner: string

beforeAll(async () => {
  db = await connectAdmin()
  owner = await linkedUser(db, { credits: 10 })
  await db.query(`insert into public.ai_providers(id,module,adapter,label,model,resolutions,capabilities)
    values ($1,'image','openrouter_images','Reference minimum fixture','fixture/minimum','{1k}',$2)`, [providerId,caps])
  const { error } = await serviceSupabase().rpc('admin_upsert_template', {
    p_template: { id, name: 'Fixture', category: 'pets', quality: 'medium', credits_cost: { '1k': 1,'2k': 2,'3k': 3 },
      visible_in: ['web','partner'], is_active: false, fields: { images: { min: 0,max: 0 },copy: [],aspectRatios: ['1:1'] } },
    p_prompt: { body: 'fixture {{photo_count}} + {{style_ref_count}}',provider_id: providerId },
    p_style_refs: [{ key,width: 16,height: 16,uploadedAt: new Date().toISOString() }],
  })
  expect(error).toBeNull()
  await publishFixture(db, id)
  bucket.upload(key,bytes,'image/webp')
})
afterAll(async () => {
  // Deleting the owner cascades the jobs which refer to the template.
  await db.query('delete from auth.users where id=$1',[owner])
  await db.query('delete from public.templates where id=$1',[id])
  await db.query('delete from public.ai_providers where id=$1',[providerId])
  await db.end()
})

function model() {
  const fake = fakeProvider()
  const provider = { ...fake.provider, id: providerId + '/fixture/minimum',
    minReferences: caps.minReferences, maxReferences: caps.maxReferences }
  return { fake,deps: { ...routeDeps(bucket.store),provider } }
}

it('reads the public zero-upload specification and sends its one private image through web and partner generation', async () => {
  const spec = await anonSupabase().from('templates').select('fields,template_image_options,partner_image_aspects').eq('id',id).single()
  expect(spec.error).toBeNull()
  expect(spec.data).toMatchObject({ fields: { images: { min: 0,max: 0 } }, template_image_options: {
    resolutions: ['1k'],aspectRatios: ['1:1'],originalRatio: false },partner_image_aspects: ['1:1'] })
  expect(JSON.stringify(spec.data)).not.toContain(key)
  const { fake,deps } = model()
  const web = await runGeneration(deps,{ userId: owner,source: 'web',templateId: id })
  const partner = await handleGenerate(partnerRequest('/api/partner/generate',{ method: 'POST',account: owner,
    idempotencyKey: randomUUID(),body: { template_id: id,inputs: { aspect_ratio: '1:1' } } }),deps)
  expect(partner.status).toBe(200)
  const receipt = await partner.json()
  expect(JSON.stringify([web,receipt])).not.toContain(key)
  expect(fake.calls).toHaveLength(2)
  for (const call of fake.calls) expect(call).toMatchObject({ prompt: 'fixture 0 + 1', images: [{ bytes,contentType: 'image/webp' }] })
  const { rows } = await db.query('select source,provider,status,inputs,credits_cost from public.generation_jobs where id=any($1) order by source',
    [[web.id,receipt.job_id]])
  expect(rows).toHaveLength(2)
  for (const [index,source] of ['graylum','web'].entries()) expect(rows[index]).toMatchObject({
    source,status: 'succeeded',provider: deps.provider.id,credits_cost: 1,inputs: { input_key: null,style_ref_keys: [key],prompt_version: 1 } })
})

it('runs with the required style ref and rejects omission before the provider or trial budget is touched', async () => {
  const { fake,deps } = model()
  const release = await holdTestBudget(db)
  try {
    await db.query("update public.profiles set role='admin' where id=$1",[owner])
    await saveTestBudget(deps.db,owner,1000)
    const credits = (await profileOf(db,owner)).credits
    const attempt = (runId: string,omit: boolean) => runTestGenerate(deps,{ actorId: owner, body: {
      run_id: runId,batch_id: randomUUID(),template_id: id,inputs: {},omit_style_refs: omit } })
    expect(await attempt(randomUUID(),false)).toMatchObject({ status: 'succeeded',inputs: { style_ref_count: 1 },promptVersion: 1 })
    const invalid = randomUUID()
    await expect(attempt(invalid,true)).rejects.toMatchObject({ code: 'MODEL_INPUT_UNSUPPORTED' })
    expect(fake.calls).toHaveLength(1)
    expect((await db.query('select 1 from public.admin_test_spend where run_id=$1',[invalid])).rowCount).toBe(0)
    expect((await db.query('select 1 from public.admin_test_runs where id=$1',[invalid])).rowCount).toBe(0)
    expect((await profileOf(db,owner)).credits).toBe(credits)
  } finally { await release() }
},120_000)

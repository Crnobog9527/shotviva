import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'

import type { IdentityJudge } from '@/core/identity-guard'
import { runGeneration } from '@/core/jobs'
import { newInputKey } from '@/core/storage'
import { runEdit, runTestGenerate, saveTestBudget } from '@/modules/image'

import { jpeg } from '../fakes/images'
import { createMemoryStore } from '../fakes/memory-store'
import { editJobRow, publishEditTemplate } from './edit-fixtures'
import { fakeProvider, seedTemplate } from './generation-fixtures'
import { connectAdmin, createUser } from './helpers'
import { serviceSupabase } from './supabase-env'
import { holdTestBudget } from './test-run-fixtures'

let pg: Client
const providerId = randomUUID()
beforeAll(async () => {
  pg = await connectAdmin()
  const caps = { resolutions: ['1k'], aspectRatios: ['4:5', '1:1'], originalRatio: true,
    minReferences: 0, maxReferences: 4, fetchedAt: new Date().toISOString() }
  await pg.query(`insert into public.ai_providers(id,module,adapter,label,model,resolutions,capabilities)
    values ($1,'image','openai_images','T97 generation fixture','fixture','{1k}',$2)`, [providerId, caps])
})
afterAll(async () => {
  await pg.query("update public.template_prompts set style_refs='[]', provider_id=null where provider_id=$1", [providerId])
  await pg.query('delete from public.ai_providers where id=$1', [providerId])
  await pg.end()
})

async function fixture() {
  const templateId = await seedTemplate(pg, { visibleIn: ['web', 'partner'], images: { min: 0, max: 1 } })
  const userId = await createUser(pg, { credits: 10 })
  const bucket = createMemoryStore()
  const inputKey = newInputKey(userId, 'image/jpeg')
  bucket.upload(inputKey, await jpeg(64, 64), 'image/jpeg')
  const refs = [19, 27].map((value) => {
    const key = `style-refs/${templateId}/${randomUUID()}.webp`
    bucket.upload(key, Uint8Array.of(value), 'image/webp')
    return { key, width: 16, height: 16, uploadedAt: new Date().toISOString() }
  })
  const { rows } = await pg.query('update public.template_prompts set body=$2, style_refs=$3, provider_id=$4 where template_id=$1 returning version',
    [templateId, 'fixture {{photo_count}} + {{style_ref_count}}', JSON.stringify(refs), providerId])
  const judge = vi.fn<IdentityJudge['judge']>(async () => ({ identitySwap: false, usage: null }))
  const fake = fakeProvider()
  const deps = { db: serviceSupabase(), store: bucket.store, provider: { ...fake.provider, id: providerId + '/fixture' }, identityJudge: { tag: 'fixture', judge, prices: null } }
  return { templateId, refs, userId, inputKey, fake, deps, judge, version: rows[0].version }
}

it.each(['web', 'graylum'] as const)('attaches and records the exact ordered references for %s', async (source) => {
  const f = await fixture()
  const view = await runGeneration(f.deps, { source, userId: f.userId, templateId: f.templateId,
    inputKey: f.inputKey, aspectRatio: '4:5', copy: { dish: 'typed words' } })
  const call = f.fake.calls[0]!
  expect(call.prompt).toBe('fixture 1 + 2')
  expect(call.images.map((image) => image.contentType)).toEqual(['image/jpeg', 'image/webp', 'image/webp'])
  expect(call.images.slice(1).map((image) => image.bytes[0])).toEqual([19, 27])
  expect((await editJobRow(pg, view.id)).inputs).toMatchObject({
    style_ref_keys: f.refs.map((ref) => ref.key), prompt_version: f.version,
  })
  expect(f.judge.mock.calls[0]?.[0].text).toBe('typed words')
  expect(JSON.stringify(view)).not.toContain('style-ref')
})

it('freezes the prompt, reference bytes and ledger version across a concurrent template save', async () => {
  const f = await fixture()
  const provider = async () => {
    await pg.query("update public.template_prompts set body='replacement', style_refs='[]' where template_id=$1", [f.templateId])
    return f.deps.provider
  }
  const view = await runGeneration({ ...f.deps, provider }, { userId: f.userId, source: 'web', templateId: f.templateId })
  expect(f.fake.calls[0]).toMatchObject({ prompt: 'fixture 0 + 2' })
  expect((await editJobRow(pg, view.id)).inputs).toMatchObject({ style_ref_keys: f.refs.map((ref) => ref.key), prompt_version: f.version })
})

it('keeps private references out of edits of a referenced work', async () => {
  const f = await fixture()
  const release = await publishEditTemplate(pg)
  try {
    const source = await runGeneration(f.deps, { userId: f.userId, source: 'web', templateId: f.templateId, inputKey: f.inputKey })
    const edit = await runEdit({ ...f.deps, classifier: null }, { userId: f.userId, sourceJobId: source.id, instruction: 'fixture edit' })
    expect(f.fake.calls[1]?.images.map((image) => image.contentType)).toEqual(['image/jpeg'])
    expect((await editJobRow(pg, edit.id)).inputs.style_ref_keys).toBeUndefined()
  } finally {
    await release()
  }
}, 120_000)

it('admin trials default to references and can disable them without reading their objects', async () => {
  const f = await fixture()
  const release = await holdTestBudget(pg)
  try {
    await pg.query("update public.profiles set role='admin' where id=$1", [f.userId])
    await saveTestBudget(f.deps.db, f.userId, 1000)
    const get = vi.spyOn(f.deps.store, 'get')
    const run = (omit_style_refs?: boolean) => runTestGenerate(f.deps, { actorId: f.userId, body: {
      run_id: randomUUID(), batch_id: randomUUID(), template_id: f.templateId, inputs: {}, omit_style_refs,
    } })
    expect((await run(true)).inputs.style_ref_count).toBe(0)
    expect(get).not.toHaveBeenCalled()
    expect((await run()).inputs.style_ref_count).toBe(2)
    expect(f.fake.calls.map((call) => call.prompt)).toEqual(['fixture 0 + 0', 'fixture 0 + 2'])
  } finally {
    await release()
  }
}, 120_000)

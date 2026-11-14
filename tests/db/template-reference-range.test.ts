import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterEach, beforeEach, expect, it } from 'vitest'

import { connectAdmin } from './helpers'

const id = 'qa-range-' + randomUUID()
const provider = randomUUID()
const template = { id, name: 'Range fixture', category: 'pets', quality: 'medium', credits_cost: { '1k': 2, '2k': 4, '3k': 6 } }
const caps = { resolutions: ['1k'], minReferences: 1, maxReferences: 2 }
const prompt = { body: 'fixture', provider_id: provider }
const refs = [{ key: `style-refs/${id}/${randomUUID()}.webp`, width: 64, height: 64, uploadedAt: new Date().toISOString() }]
let db: Client

const fields = (min: number, max: number) => ({ ...template, fields: { images: { min, max } } })
const save = (min: number, max: number, styleRefs: typeof refs) => db.query('select public.admin_upsert_template($1,$2,$3)',
  [fields(min,max),prompt,JSON.stringify(styleRefs)])
const legacySave = (min: number, max: number, body: object | null) =>
  db.query('select public.admin_upsert_template($1,$2)', [fields(min,max),body])

async function stored() {
  return (await db.query(`select t.fields->'images' as uploads,p.style_refs,p.version,p.body from public.templates t
    join public.template_prompts p on p.template_id=t.id where t.id=$1`,[id])).rows[0]
}

async function refused(action: () => Promise<unknown>) {
  await db.query('savepoint invalid_save')
  try { await expect(action()).rejects.toThrow('MODEL_REFERENCE_LIMIT') }
  finally { await db.query('rollback to invalid_save') }
}

beforeEach(async () => {
  db = await connectAdmin()
  await db.query('begin')
  await db.query(`insert into public.ai_providers (id,module,adapter,label,model,resolutions,capabilities)
    values ($1,'image','openrouter_images','Range fixture','fixture/range','{1k}',$2)`, [provider,caps])
})
afterEach(async () => { await db.query('rollback'); await db.end() })

it('accepts a model minimum supplied entirely by the template and leaves the public upload range intact', async () => {
  await save(0,0,refs)
  expect(await stored()).toMatchObject({ uploads: { min: 0, max: 0 }, style_refs: refs, version: 1 })
  // Legacy writer (also called by template sync) omits both refs and provider.
  await legacySave(0,1,{ body: 'legacy' })
  await legacySave(0,1,null)
  expect(await stored()).toEqual({ uploads: { min: 0, max: 1 }, style_refs: refs, version: 2, body: 'legacy' })
})

it('rejects dropping the only required ref and rejects an excessive combined max, including old saves', async () => {
  await save(0,1,refs)
  const previous = await stored()
  await refused(() => save(0,1,[]))
  await refused(() => legacySave(0,2,{ body: 'should roll back' }))
  await refused(() => legacySave(0,2,null))
  await refused(() => db.query("update public.template_prompts set style_refs='[]' where template_id=$1",[id]))
  expect(await stored()).toEqual(previous)
  // Removing the ref is legal when the same save makes the user provide the missing input.
  await save(1,2,[])
  expect(await stored()).toMatchObject({ uploads: { min: 1, max: 2 }, style_refs: [], version: 2 })
})

it('checks both ends for ordinary callers with no style refs and honors the default model', async () => {
  await db.query("update public.ai_providers set is_active=false where module='image' and is_active")
  await db.query('update public.ai_providers set is_active=true where id=$1',[provider])
  await refused(() => legacySave(0,1,null))
  await refused(() => legacySave(1,3,{ body: 'fixture' }))
  await db.query('select public.admin_upsert_template($1,$2,$3)',[fields(0,1),{ body: 'fixture' }, JSON.stringify(refs)])
  expect(await stored()).toMatchObject({ uploads: { min: 0, max: 1 }, style_refs: refs })
})

it('counts style images even when legacy photo fields are missing, without changing bare legacy saves', async () => {
  const sparse = (entries: typeof refs) => db.query('select public.admin_upsert_template($1,$2,$3)',
    [template,prompt,JSON.stringify(entries)])
  const three = Array.from({ length: 3 }, () => ({ ...refs[0],key: `style-refs/${id}/${randomUUID()}.webp` }))
  await refused(() => sparse(three))
  await sparse(refs)
  expect((await stored()).style_refs).toEqual(refs)
  await legacySave(1,1,prompt)
  await db.query('select public.admin_upsert_template($1,$2,$3)',[template,prompt,'[]'])
})

it('leaves a video template independent of the active image model', async () => {
  await db.query("update public.ai_providers set is_active=false where module='image' and is_active")
  await db.query('update public.ai_providers set is_active=true where id=$1',[provider])
  await db.query('select public.admin_upsert_template($1,$2)',[{ ...fields(0,0),module: 'video' },{ body: 'fixture' }])
  expect((await stored()).uploads).toEqual({ min: 0, max: 0 })
})

it.each(['anon','authenticated'])('does not expose the private range helper or template writes to %s', async role => {
  const grants = await db.query(`select has_function_privilege($1,'admin.assert_template_reference_range(text)','EXECUTE') as helper,
    has_function_privilege($1,'public.admin_upsert_template(jsonb,jsonb)','EXECUTE') as legacy,
    has_function_privilege($1,'public.admin_upsert_template(jsonb,jsonb,jsonb)','EXECUTE') as explicit`,[role])
  expect(grants.rows[0]).toEqual({ helper: false, legacy: false, explicit: false })
})

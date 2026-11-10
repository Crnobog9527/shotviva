import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { connectAdmin, createUser } from './helpers'
import { anonSupabase, serviceSupabase } from './supabase-env'

const id = 't97-' + randomUUID()
const provider = randomUUID()
const costs = { '1k': 2, '2k': 4, '3k': 6 }
const template = { id, name: 'T97 fixture', category: 'pets', quality: 'medium', credits_cost: costs,
  fields: { images: { min: 0, max: 1 } }, visible_in: ['web', 'partner'], is_active: true }
const prompt = { body: 'fixture', provider_id: provider }
const ref = () => ({ key: `style-refs/${id}/${randomUUID()}.webp`, width: 900, height: 1536,
  uploadedAt: new Date().toISOString() })
const refs = [ref(), ref()]
let db: Client

async function saved() {
  return (await db.query('select style_refs,version from public.template_prompts where template_id=$1', [id])).rows[0]
}

async function save(styleRefs: unknown) {
  const { error } = await serviceSupabase().rpc('admin_upsert_template', {
    p_template: template, p_prompt: prompt, p_style_refs: styleRefs,
  })
  return error
}

beforeAll(async () => {
  db = await connectAdmin()
  const caps = { resolutions: ['1k'], aspectRatios: ['1:1'], originalRatio: false,
    minReferences: 0, maxReferences: 3, catalogImageCosts: { '1k': 0.01 }, fetchedAt: new Date().toISOString() }
  await db.query(`insert into public.ai_providers (id,module,adapter,label,model,resolutions,capabilities)
    values ($1,'image','openrouter_images','T97 fixture','fixture/style-test','{1k}',$2)`, [provider,caps])
})

afterAll(async () => {
  await db.query('delete from public.templates where id=$1', [id])
  await db.query('delete from public.ai_providers where id=$1', [provider])
  await db.end()
})

describe('private style references on a template', () => {
  beforeEach(async () => { await db.query('delete from public.templates where id=$1', [id]) })

  it('saves ordered refs through PostgREST and versions reorder/replacement but not an unchanged save', async () => {
    expect(await save(refs)).toBeNull()
    const original = await saved()
    expect(original).toEqual({ style_refs: refs, version: 1 })
    expect(await save(refs)).toBeNull()
    expect(await saved()).toEqual(original)
    const reordered = refs.toReversed()
    expect(await save(reordered)).toBeNull()
    expect(await saved()).toEqual({ style_refs: reordered, version: original.version + 1 })
    await db.query('select public.admin_upsert_template($1,$2)', [template, { body: 'updated' }])
    expect((await saved()).style_refs).toEqual(reordered)
    const beforeBoth = await saved()
    // Body and refs change together in the same logical save.
    expect(await save([])).toBeNull()
    expect((await saved()).version).toBe(beforeBoth.version + 1)
    expect((await saved()).style_refs).toEqual([])
  })

  it('rejects malformed metadata, a fourth entry, duplicates and keys outside this exact template', async () => {
    expect(await save([])).toBeNull()
    const entry = ref()
    for (const invalid of [
      {}, null, [entry,entry], [ref(),ref(),ref(),ref()], [{ ...entry, uploadedAt: '2025-02-31T12:00:00Z' }],
      [{ ...entry, key: entry.key.replace(id, id + '-other') }], [{ ...entry, key: entry.key.replace(id, id + '/..') }],
      [{ ...entry, width: 1537 }], [{ ...entry, height: '400' }], [{ ...entry, url: 'fixture' }],
    ]) expect(await save(invalid)).not.toBeNull()
    expect((await saved()).style_refs).toEqual([])
  })

  it('checks the combined count and the active price rules even on a legacy save', async () => {
    expect(await save(refs)).toBeNull()
    expect((await save([...refs, ref()]))?.message).toBe('MODEL_REFERENCE_LIMIT')
    const changed = { ...template, fields: { images: { min: 0, max: 2 } } }
    await expect(db.query('select public.admin_upsert_template($1,$2)', [changed,prompt])).rejects.toThrow('MODEL_REFERENCE_LIMIT')
    const price_floors = { providers: { [provider]: { medium: { ...costs, '1k': 99 } } } }
    await expect(db.query('select public.admin_upsert_template($1,$2,$3)', [
      { ...template, price_floors },prompt,JSON.stringify([]),
    ])).rejects.toThrow('MODEL_CREDIT_FLOOR')
    expect((await saved()).style_refs).toEqual(refs)
  })

  it('keeps the public catalogue, computed columns and both client roles away from private metadata', async () => {
    expect(await save(refs)).toBeNull()
    const anon = anonSupabase()
    const row = await anon.from('templates').select('*,template_image_options,partner_image_aspects').eq('id',id).single()
    expect(row.error).toBeNull()
    expect(JSON.stringify(row.data)).not.toContain('style-refs/')
    expect(row.data).not.toHaveProperty('style_refs')
    for (const role of ['anon','authenticated']) {
      const { rows } = await db.query(`select has_column_privilege($1,'public.template_prompts','style_refs','select') as reading,
        has_function_privilege($1,'public.admin_upsert_template(jsonb,jsonb,jsonb)','execute') as writing`, [role])
      expect(rows[0]).toEqual({ reading: false, writing: false })
    }
  })
})

it('keeps the raw attribution service-only even for the job owner, preserving legacy and empty-ref history', async () => {
  await db.query('begin')
  try {
    const owner = await createUser(db)
    const other = await createUser(db)
    const ids = [randomUUID(),randomUUID(),randomUUID()]
    for (const [i, inputs] of [{ style_ref_keys: [refs[0].key] }, {}, { style_ref_keys: [] }].entries()) {
      await db.query(`insert into public.generation_jobs(id,user_id,module,template_id,inputs,source,visibility,credits_cost,credit_pool)
        values($1,$2,'image','freeform',$3,'web','public',1,'free')`, [ids[i],owner,inputs])
    }
    expect((await db.query('select inputs from public.generation_jobs where id=$1',[ids[0]])).rows[0].inputs.style_ref_keys).toEqual([refs[0].key])
    await db.query('set local role authenticated')
    const read = async (uid: string) => {
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [uid])
      return (await db.query('select * from public.generation_jobs where id=any($1)', [ids])).rows
    }
    expect((await read(owner)).map(row => row.id).sort()).toEqual(ids.slice(1).sort())
    expect(await read(other)).toEqual([])
  } finally { await db.query('rollback') }
})

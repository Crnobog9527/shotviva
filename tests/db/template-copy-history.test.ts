import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { duplicateTemplate } from '@/core/admin/template-copy'
import { loadGenerationTemplate, loadTestTemplate } from '@/core/templates/generation-template'
import { templateCall } from '@/core/jobs/generation-call'
import { createMemoryStore } from '../fakes/memory-store'
import { anonClient, connectAdmin, createUser } from './helpers'
import { serviceSupabase } from './supabase-env'

const source = 'copy-' + randomUUID()
const requestId = randomUUID()
const provider = randomUUID()
const base = 'https://example.test/assets'
const ref = { key: `style-refs/${source}/${randomUUID()}.webp`, width: 20, height: 20, uploadedAt: new Date().toISOString() }
const assets = createMemoryStore(), privateAssets = createMemoryStore()
const stores = { public: assets.store, private: privateAssets.store }
const template = { id: source, name: 'Source', category_key: 'pets', credits_cost: { '1k': 5, '2k': 8, '3k': 10 },
  fields: { images: { min: 0, max: 1 }, copy: [], aspectRatios: ['1:1'] }, visible_in: ['web'], is_active: true }
const first = { body: 'Fixture A', provider_id: null, model_params: { fixture: 'A' } }
const second = { body: 'Fixture B', provider_id: provider, model_params: { fixture: 'B' } }
let pg: Awaited<ReturnType<typeof connectAdmin>>, actor: string, copy: string

beforeAll(async () => {
  pg = await connectAdmin()
  actor = await createUser(pg)
  await pg.query("update public.profiles set role='admin' where id=$1",[actor])
  await pg.query("insert into public.ai_providers(id,module,adapter,label,model,vault_secret_id,api_key_last4) values($1,'image','openai_images','QA','fixture-model',$2,'test')",[provider,randomUUID()])
  template.category_key = (await pg.query('select key from public.template_categories where not is_system limit 1')).rows[0].key
  await pg.query('select public.admin_upsert_template($1,$2,$3)',[template,first,JSON.stringify([ref])])
  await pg.query('update public.templates set cover_before_url=$2,cover_locales=$3 where id=$1',
    [source,`${base}/covers/${source}/before.webp`, { zh: { after: `${base}/covers/${source}/after.webp` } }])
  privateAssets.upload(ref.key,Uint8Array.of(4),'image/webp')
  for (const file of ['before','after']) assets.upload(`covers/${source}/${file}.webp`,Uint8Array.of(9),'image/webp')
})
afterAll(async () => {
  await pg.query('delete from public.templates where id=any($1)',[[source,copy].filter(Boolean)])
  await pg.query('delete from public.ai_providers where id=$1',[provider])
  await pg.query('delete from auth.users where id=$1',[actor])
  await pg.end()
})

const save = (id: string, prompt: object, expected: number, selected?: number) => serviceSupabase().rpc('admin_save_versioned_template',{
  p_actor: actor,p_template: { ...template, id, is_active: undefined },p_prompt: prompt,p_expected: expected,p_selected: selected,
})
it('copies once across simultaneous requests; does not transfer history or publication and preserves the original', async () => {
  await pg.query('update public.template_prompts set body=$2 where template_id=$1',[source,'Fixture source v2'])
  const run = () => duplicateTemplate({ db: serviceSupabase(), stores, base },actor,{ source,requestId })
  const [a,b] = await Promise.all([run(),run()])
  copy = a.id
  expect(a).toEqual(b)
  const draft = await loadTestTemplate(serviceSupabase(),copy)
  expect(draft.template).toMatchObject({ isActive:false, featuredRank:null, name:'Source (Copy)', coverBeforeUrl: `${base}/covers/${copy}/before.webp`,
    coverLocales: { zh: { after: `${base}/covers/${copy}/after.webp` } } })
  expect(draft.prompt).toMatchObject({ version:1, body:'Fixture source v2',styleRefs:[{key:ref.key.replace(source,copy)}] })
  await expect(loadGenerationTemplate(serviceSupabase(),copy,'web')).rejects.toThrow('Template not found')
  await privateAssets.store.delete(ref.key.replace(source,copy))
  expect(await privateAssets.store.get(ref.key)).toEqual(Uint8Array.of(4))
  expect((await loadGenerationTemplate(serviceSupabase(),source,'web')).prompt.version).toBe(2)
  expect(await save(copy,second,1,2)).toMatchObject({error:{message:'VERSION_NOT_FOUND'}})
})

it('restores in both directions, never overwrites history, and both request builders use the selected private snapshot', async () => {
  expect(await save(source,second,2)).toMatchObject({data:3,error:null})
  const inputs = { copy:{}, note:'', aspectRatio:'1:1',toggles:{},confirmed:[] }
  for (const [expected,selected,prompt] of [[3,1,first],[1,3,second]] as const) {
    expect(await save(source,prompt,expected,selected)).toMatchObject({data:selected,error:null})
    const db = serviceSupabase()
    for (const loaded of [await loadTestTemplate(db,source),await loadGenerationTemplate(db,source,'web')]) {
      const resolve = vi.fn(async (id: string | null) => ({ id:id ?? 'default',generate:vi.fn() }))
      const { call,provider: picked } = await templateCall({store:stores.private,provider:resolve},loaded,inputs,null,
        { resolution:'1k',providerId:loaded.prompt.providerId })
      expect(loaded.prompt.version).toBe(selected)
      expect(call.prompt).toBe(prompt.body)
      expect(picked.id).toBe(prompt.provider_id ?? 'default')
      expect(call.images[0].bytes[0]).toBe(4)
    }
  }
  expect(await save(source,first,3,1)).toMatchObject({data:1,error:null})
  expect(await save(source,{ ...first,body:'Branch' },1)).toMatchObject({data:4,error:null})
  expect(await save(source,first,1,1)).toMatchObject({error:{message:'STALE_PROMPT'}})
  await pg.query('update public.ai_providers set model=$2 where id=$1',[provider,'reconfigured'])
  expect(await save(source,second,4,3)).toMatchObject({error:{message:'HISTORICAL_PROVIDER_UNAVAILABLE'}})
  const {rows} = await pg.query('select version,body from public.template_prompt_versions where template_id=$1 order by version',[source])
  expect(rows.map(r=>r.body)).toEqual([first.body,'Fixture source v2',second.body,'Branch'])
})

it('rejects a changed source before insert and limits prompt history and copy endpoints to privileged use', async () => {
  const db = serviceSupabase(), args = {p_actor:actor,p_source:source,p_request:randomUUID()}
  const {data:manifest} = await db.rpc('admin_template_copy_source',args)
  await pg.query("update public.templates set name='changed' where id=$1",[source])
  expect(await db.rpc('admin_commit_template_copy',{...args,p_target:'unused',p_token:manifest.token,p_assets:manifest.assets})).toMatchObject({error:{message:'SOURCE_CHANGED'}})
  expect(await db.rpc('admin_template_copy_source',{...args,p_actor:randomUUID()})).toMatchObject({error:{message:'FORBIDDEN'}})
  expect((await anonClient().rpc('admin_template_copy_source',args)).error).not.toBeNull()
  for (const role of ['anon','authenticated','service_role']) {
    const {rows} = await pg.query("select has_table_privilege($1,'public.template_prompt_versions','select') as r, has_table_privilege($1,'public.template_prompt_versions','update') as w",[role])
    expect(rows[0]).toEqual({r:role==='service_role', w:false})
  }
})

it('records the old Standard on v2 style copies and leaves the source and HD/Max untouched', async () => {
  await pg.query('begin')
  try {
    await pg.query("update public.templates set category_key='art-styles',credits_cost=$2 where id=$1",[source,{'1k':26,'2k':55,'3k':85}])
    await pg.query(`insert into public.system_settings(key,value) values ('pricing_catalog_version','"v2"')
      on conflict(key) do update set value=excluded.value`)
    const req=randomUUID(), dest='qa-copy-'+randomUUID()
    const manifest=async ()=>(await pg.query('select public.admin_template_copy_source($1,$2,$3) m',[actor,source,req])).rows[0].m
    const {token,assets: old}=await manifest()
    const moved=JSON.stringify(old).replaceAll('/'+source+'/', '/'+dest+'/')
    const saved=await pg.query('select public.admin_commit_template_copy($1,$2,$3,$4,$5,$6) r',[actor,source,req,dest,token,moved])
    expect(saved.rows[0].r).toEqual({id:dest,previousStandard:26})
    expect((await manifest()).existing).toEqual(saved.rows[0].r)
    const prices=async(id:string)=>(await pg.query('select credits_cost,is_active from public.templates where id=$1',[id])).rows[0]
    expect(await prices(dest)).toEqual({credits_cost:{'1k':20,'2k':55,'3k':85},is_active:false})
    expect(await prices(source)).toEqual({credits_cost:{'1k':26,'2k':55,'3k':85},is_active:true})
  } finally { await pg.query('rollback') }
})

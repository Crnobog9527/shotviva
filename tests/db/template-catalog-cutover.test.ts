import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { connectAdmin, createUser } from './helpers'

const model = 'gpt-image-2.6-sunburst'
const provider = randomUUID()
const tag = provider + '/' + model
const costs = { '1k': 45, '2k': 120, '3k': 190 }
let db: Client
let user: string

async function sample(id: string) {
  await db.query(`insert into public.templates(id,name,category,fields,is_active,visible_in)
    values ($1,$1,'pets','{"images":{"min":1,"max":1},"aspectRatios":["1:1"],"copy":[]}',true,'{web,partner}')`,[id])
  await db.query('insert into public.template_prompts(template_id,body) values ($1,$1)',[id])
}

async function activate() {
  await db.query(`insert into public.system_settings(key,value) values ('pricing_catalog_version','"v2"')
    on conflict(key) do update set value=excluded.value`)
  await db.query('select admin.activate_template_price_catalog_v2()')
}

const reserve = (id: string, cost: number | null, resolution: string, source = 'web', parent: string | null = null, job = randomUUID(), routedProvider = tag) =>
  db.query(`select id,credits_cost,credit_pool,inputs->>'pricing_catalog_version' as version from public.reserve_credits(
    $1,$2,'image',$3,$4,$5,jsonb_build_object('resolution',$6::text),$7,null,null,$8)`,
    [job,user,id,cost,source,resolution,routedProvider,parent])

async function refuses(work: () => Promise<unknown>, message: string) {
  await db.query('savepoint rejected')
  await expect(work()).rejects.toThrow(message)
  await db.query('rollback to rejected')
}

// DB test files run concurrently. Never wait holding one catalogue table while another
// fixture holds a different one. A savepoint releases every partial lock before retrying.
async function isolateCatalog() {
  for (let attempt = 0; attempt < 200; attempt++) {
    await db.query('savepoint isolating')
    try {
      await db.query("select pg_advisory_xact_lock(hashtextextended('shotviva.template_catalog',0))")
      await db.query('lock table public.templates,public.template_prompts,public.ai_providers in share row exclusive mode nowait')
      return
    } catch (error) {
      await db.query('rollback to isolating')
      if ((error as { code?: string }).code !== '55P03') throw error
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  }
  throw new Error('Could not isolate template cutover fixtures')
}

beforeEach(async () => {
  db = await connectAdmin()
  await db.query('begin')
  await isolateCatalog()
  await db.query('update public.templates set is_active=false,featured_rank=null where is_active')
  await db.query("update public.ai_providers set is_active=false where module='image' and is_active")
  await db.query(`insert into public.ai_providers(id,label,model,adapter,is_active,resolutions)
    values ($1,'Catalog test',$2,'openai_images',true,'{1k,2k,3k}')`,[provider,model])
  await db.query("update public.templates set is_active=true where id in ('edit','freeform')")
  await sample('promo-poster')
  await sample('bright-listing')
  user = await createUser(db,{ credits: 1200 })
  await db.query("update public.profiles set role='admin' where id=$1",[user])
}, 20000)
afterEach(async () => { await db.query('rollback'); await db.end() })

describe('activated template prices', () => {
  it('retains existing quotes until activation and charges the exact web, partner and edit offers', async () => {
    await refuses(() => db.query('select admin.activate_template_price_catalog_v2()'),'TEMPLATE_CATALOG_VERSION_NOT_ACTIVE')
    expect((await reserve('promo-poster',null,'1k')).rows[0].credits_cost).toBe(2)
    const unitPrice = async () => Number((await db.query(
      "select public.admin_image_pricing_catalog('fallback')->>'unit_price' as unit_price")).rows[0].unit_price)
    expect(await unitPrice()).toBeCloseTo(713 / 3360, 9)
    await activate()
    expect(await unitPrice()).toBeCloseTo(891 / 168000, 9)
    await activate()
    const quote = await db.query("select quality,credits_cost from public.templates where id='promo-poster' and is_active")
    expect(quote.rows[0]).toEqual({ quality:'medium', credits_cost:costs })
    await refuses(() => reserve('promo-poster',2,'1k'),'TEMPLATE_QUOTE_CHANGED')
    await refuses(() => reserve('promo-poster',null,'1k'),'TEMPLATE_QUOTE_CHANGED')
    await refuses(() => reserve('bright-listing',2,'1k'),'TEMPLATE_NOT_FOUND')
    const id = randomUUID()
    const parent = (await reserve('promo-poster',120,'2k','web',null,id)).rows[0]
    expect(parent).toMatchObject({ id,credits_cost:120,credit_pool:'paid',version:'v2' })
    expect((await reserve('promo-poster',2,'2k','web',null,id)).rows[0].id).toBe(id)
    await db.query("select public.confirm_job($1,'output',null,null)",[id])
    expect((await reserve('edit',58,'3k','web',id)).rows[0].credits_cost).toBe(58)
    const partner = (await reserve('freeform',45,'1k','graylum')).rows[0]
    expect(partner.credits_cost).toBe(45)
    await db.query("select public.refund_job($1,'test')",[partner.id])
    await db.query("select public.refund_job($1,'test')",[partner.id])
    expect((await db.query('select credits from public.profiles where id=$1',[user])).rows[0].credits).toBe(1020)
    await refuses(() => db.query('select admin.rollback_template_price_catalog_v2()'),'TEMPLATE_CATALOG_HAS_NEW_JOBS')
  })

  it('requires normal T96 pricing on a substitute provider', async () => {
    const other = randomUUID()
    await db.query(`insert into public.ai_providers(id,label,model,adapter,resolutions,estimated_image_costs)
      values($1,'Alternate','alternate-model','openai_images','{1k,2k,3k}','{"1k":1.00}')`,[other])
    await activate()
    const request = () => reserve('promo-poster',45,'1k','web',null,randomUUID(),other+'/alternate-model')
    await refuses(request,'TEMPLATE_QUOTE_CHANGED')
    await db.query(`update public.ai_providers set adapter='openrouter_images',
      capabilities=capabilities || '{"catalogImageCosts":{"1k":0.02}}' where id=$1`,[other])
    // An operator's explicit (higher) estimate still wins over the catalog.
    await refuses(request,'TEMPLATE_QUOTE_CHANGED')
    await db.query(`update public.ai_providers set estimated_image_costs='{}' where id=$1`,[other])
    expect((await request()).rows[0].credits_cost).toBe(45)
  })

  it('counts private references toward the model minimum on new and legacy saves while enforcing v2 prices', async () => {
    await activate()
    await db.query(`update public.ai_providers set capabilities=capabilities || '{"minReferences":1,"maxReferences":2}' where id=$1`, [provider])
    const refs = [{ key: 'style-refs/promo-poster/' + randomUUID() + '.webp', width: 20, height: 20,
      uploadedAt: new Date().toISOString() }]
    // The approved 45-credit price is legal even below the ordinary 1K floor.
    const floor = { medium: { ...costs, '1k': 50 } }
    const template = { id: 'promo-poster', name: 'Poster', category: 'pets', quality: 'medium',
      fields: { images: { min: 0, max: 0 } }, credits_cost: costs,
      price_floors: { providers: { [provider]: floor }, models: { [provider]: model }, version: 'v2' } }
    const prompt = { body: 'fixture' }
    const withRefs = (price: number, next: typeof refs) => db.query('select public.admin_upsert_template($1,$2,$3)',
      [{ ...template, credits_cost: { ...costs, '1k': price } }, prompt, JSON.stringify(next)])
    await withRefs(45, refs)
    await db.query('select public.admin_upsert_template($1,$2)', [template, prompt])
    await db.query('select public.admin_upsert_template($1,null)', [template])
    await refuses(() => withRefs(45, []), 'MODEL_REFERENCE_LIMIT')
    const tooMany = { ...template, fields: { images: { min: 0, max: 2 } } }
    await refuses(() => db.query('select public.admin_upsert_template($1,null)', [tooMany]), 'MODEL_REFERENCE_LIMIT')
    await refuses(() => withRefs(44, refs), 'MODEL_CREDIT_FLOOR')
    const stale = { ...template, price_floors: { ...template.price_floors, version: 'v1' } }
    await refuses(() => db.query('select public.admin_upsert_template($1,$2)', [stale, prompt]), 'MODEL_CHANGED')
    const { rows } = await db.query(`select t.fields->'images' as images, t.credits_cost, p.style_refs
      from public.templates t join public.template_prompts p on p.template_id=t.id where t.id=$1`, [template.id])
    expect(rows[0]).toEqual({ images: template.fields.images, credits_cost: costs, style_refs: refs })
  })

  it('rejects unclassified templates and missing model tiers; rolls the snapshot back only when unchanged', async () => {
    await sample('pending-rule')
    await refuses(activate,'UNMAPPED_ACTIVE_TEMPLATES: pending-rule')
    await db.query("update public.templates set is_active=false where id='pending-rule'")
    await db.query("update public.ai_providers set resolutions='{1k}' where id=$1",[provider])
    await refuses(activate,'TEMPLATE_MODEL_NOT_READY')
    await db.query("update public.ai_providers set resolutions='{1k,2k,3k}' where id=$1",[provider])
    await activate()
    await refuses(() => db.query("update public.templates set is_active=true where id='bright-listing'"),'TEMPLATE_RETIRED')
    await db.query("update public.templates set credits_cost=jsonb_set(credits_cost,'{1k}','77') where id='promo-poster'")
    await refuses(() => db.query('select admin.rollback_template_price_catalog_v2()'),'TEMPLATE_CATALOG_CHANGED')
    await db.query("update public.templates set credits_cost=jsonb_set(credits_cost,'{1k}','45') where id='promo-poster'")
    await db.query('select admin.rollback_template_price_catalog_v2()')
    expect((await db.query("select is_active from public.templates where id='bright-listing'")).rows[0].is_active).toBe(true)
  })

  it('enforces the sales minimum on ordinary writes, bulk changes and art drafts', async () => {
    await activate()
    const cheap = { medium: { '1k': 1, '2k': 1, '3k': 1 }, high: { '1k': 1, '2k': 1, '3k': 1 } }
    const floors = { ...cheap, version: 'v2', providers: { [provider]: cheap } }
    const write = (id: string, category: string, fee: number, tier = '1k') =>
      db.query('select public.admin_upsert_template($1,null)', [{ id, name: 'Fixture', category, quality:'medium',
        fields:{ images:{ min:1,max:1 } }, credits_cost: { ...costs,[tier]:fee }, price_floors:floors }])
    await refuses(() => write('promo-poster','pets',44),'MODEL_CREDIT_FLOOR')
    await refuses(() => write('promo-poster','pets',119,'2k'),'MODEL_CREDIT_FLOOR')
    await refuses(() => db.query("select public.admin_bulk_edit_templates('{promo-poster}',$1,$2,$3,'{en,zh}')",
      [{credits_cost:{'3k':189}},floors,user]),'MODEL_CREDIT_FLOOR')
    await refuses(() => write('draft-art','art-styles',19),'MODEL_CREDIT_FLOOR')
    await refuses(() => db.query('select public.admin_upsert_template($1,null)', [{id:'unapproved-live-art',
      category:'Art Styles', name:'Test', quality:'medium', is_active:true, credits_cost:{...costs,'1k':20},
      price_floors:floors}]),'TEMPLATE_RETIRED')
    await write('draft-art','art-styles',20)
    await refuses(() => write('draft-art','art-styles',21),'MODEL_CREDIT_FLOOR')
    await refuses(() => db.query("update public.templates set is_active=true where id='draft-art'"),'TEMPLATE_RETIRED')
  })

  it('only sells a style with an approved binding and all three approved tiers', async () => {
    const id = 'qa-future-style'
    const fees = {'1k':26,'2k':55,'3k':85} // Hypothetical reviewed v2 catalogue, scoped to this transaction.
    const view = (await db.query("select pg_get_viewdef('admin.template_tariffs_v2'::regclass) as body")).rows[0].body
    await db.query(`create or replace view admin.template_tariffs_v2 as ${view.trim().replace(/;$/,'')}
      union all select 'qa-future-style','medium','{"1k":26,"2k":55,"3k":85}'::jsonb,true
      where current_setting('test.approved_synthetic',true)='yes'`)
    await sample(id)
    await db.query("update public.templates set category_key='art-styles' where id=$1",[id])
    await activate()
    expect((await db.query('select is_active from public.templates where id=$1',[id])).rows[0].is_active).toBe(false)
    await refuses(() => db.query('update public.templates set is_active=true where id=$1',[id]),'TEMPLATE_RETIRED')
    // The later signed route activates the tariff for this previously retired draft, not its category.
    await db.query("set local test.approved_synthetic='yes'")
    await db.query(`update admin.template_price_snapshots s set provider_id=p.id,provider_endpoint_hash=md5(p.base_url)
      from public.ai_providers p, admin.template_price_batches b
      where b.id=s.batch_id and b.reverted_at is null and s.template_id=$1 and p.id=$2`,[id,provider])
    await db.query("update public.templates set quality='medium',credits_cost=$2 where id=$1",[id,fees])
    expect((await db.query("select admin.template_catalog_minimums()->$1::text as tariff",[id])).rows[0].tariff)
      .toMatchObject({ quality:'medium', costs:fees, style_sale_approved:true })
    // Recategorizing an approved ordinary poster is not a style-purpose receipt.
    await refuses(async () => {
      await db.query("update public.templates set category_key='art-styles' where id='promo-poster'")
      await db.query('set constraints style_sale_binding immediate')
    },'TEMPLATE_RETIRED')
    const publish = () => db.query('update public.templates set is_active=true where id=$1',[id])
    await publish()
    await db.query('set constraints style_sale_binding immediate')
    expect((await reserve(id,fees['1k'],'1k')).rows[0].credits_cost).toBe(fees['1k'])
    await refuses(() => db.query("update public.templates set quality='high' where id=$1",[id]),'TEMPLATE_RETIRED')
    await db.query("update public.templates set category_key='pets' where id=$1",[id])
    const other = randomUUID()
    await db.query(`insert into public.ai_providers(id,label,model,adapter,estimated_image_costs)
      values($1,'Cheaper','unapproved','openai_images','{"1k":0.001}')`,[other])
    await refuses(() => db.query('update public.template_prompts set provider_id=$2 where template_id=$1',[id,other]),'TEMPLATE_RETIRED')
    await refuses(() => reserve(id,fees['1k'],'1k','web',null,randomUUID(),other+'/unapproved'),'TEMPLATE_RETIRED')
  })

  it('admits only the approved exact fee in the matching quality and model for bulk saves and upserts', async () => {
    await activate()
    await db.query('set local role service_role')
    const { rows } = await db.query("select public.admin_image_pricing_catalog('default') as catalog")
    expect(rows[0].catalog.version).toBe('v2')
    expect(rows[0].catalog.providers.find((p: { provider_id: string }) => p.provider_id === provider).approved['promo-poster'].costs).toEqual(costs)
    await db.query('reset role')
    const high = { high:{'1k':100,'2k':160,'3k':250},medium:{'1k':100,'2k':160,'3k':250} }
    const floor = { ...high,providers:{[provider]:high},models:{[provider]:model},version:'v2' }
    const bulk = (cost: number) => db.query("select public.admin_bulk_edit_templates('{promo-poster}',$1,$2,$3,'{en,zh}') r",
      [{credits_cost:{'1k':cost}},floor,user])
    expect((await bulk(45)).rows[0].r.failures).toEqual([])
    expect((await bulk(46)).rows[0].r.failures[0].reason).toBe('below_floor')
    const save = (quality: string, value: number) => db.query('select public.admin_upsert_template($1,null)',[
      {id:'promo-poster',name:'Poster',category:'pets',quality,fields:{images:{min:1,max:1}},credits_cost:{...costs,'1k':value},price_floors:floor}])
    await save('medium',45)
    await refuses(() => save('medium',46),'MODEL_CREDIT_FLOOR')
    await refuses(() => save('high',45),'MODEL_CREDIT_FLOOR')
    await db.query('update public.ai_providers set model=$2 where id=$1',[provider,'other-model'])
    await refuses(() => save('medium',45),'MODEL_CHANGED')
    for (const role of ['anon','authenticated','service_role']) {
      const { rows } = await db.query("select has_function_privilege($1,'admin.activate_template_price_catalog_v2()','execute') as allowed",[role])
      expect(rows[0].allowed).toBe(false)
    }
  })
})

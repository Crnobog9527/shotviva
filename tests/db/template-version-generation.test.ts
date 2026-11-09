import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { runGeneration } from '@/core/jobs'
import { runTestGenerate, saveTestBudget } from '@/modules/image'
import { createMemoryStore } from '../fakes/memory-store'
import { connectAdmin, createUser } from './helpers'
import { serviceSupabase } from './supabase-env'
import { fakeProvider, seedTemplate } from './generation-fixtures'
import { holdTestBudget } from './test-run-fixtures'

// Run both real submit/settle paths. Only object storage and the paid provider are replaced.
it('sends the selected version to both adapters and preserves each completed job and trial receipt after switching back', async () => {
  const pg = await connectAdmin(), db = serviceSupabase()
  const unlock = await holdTestBudget(pg)
  try {
    const admin = await createUser(pg,{credits:100})
    await pg.query("update public.profiles set role='admin' where id=$1",[admin])
    await saveTestBudget(db,admin,1000)
    const id = await seedTemplate(pg,{images:{min:0,max:1}})
    const initial = (await pg.query('select body from public.template_prompts where template_id=$1',[id])).rows[0].body
    const providerId = randomUUID()
    await pg.query(`insert into public.ai_providers(id,module,adapter,label,model,vault_secret_id,api_key_last4)
      values($1,'image','openai_images','Fixture','v2-model',$2,'test')`,[providerId,randomUUID()])
    await pg.query("update public.template_prompts set body='version two',provider_id=$2 where template_id=$1",[id,providerId])
    const t = (await pg.query('select id,name,category_key,fields,quality,credits_cost,visible_in from public.templates where id=$1',[id])).rows[0]
    const adapter = fakeProvider(), routes: (string | null)[] = []
    const deps = {db,store:createMemoryStore().store,provider: async (binding: string | null) => {
      routes.push(binding); return {...adapter.provider,id:binding ?? 'fixture-default'}
    }}
    const receipts: {job: string; run: string; version: number}[] = []
    for (const [expected, version, body, binding] of [[2,1,initial,null],[1,2,'version two',providerId]] as const) {
      const result = await db.rpc('admin_save_versioned_template',{p_actor:admin,p_template:t,
        p_prompt:{body,provider_id:binding,model_params:{}},p_expected:expected,p_selected:version})
      expect(result).toMatchObject({data:version,error:null})
      const job = await runGeneration(deps,{source:'web',userId:admin,templateId:id,aspectRatio:'1:1',copy:{dish:'sample'}})
      const run = await runTestGenerate(deps,{actorId:admin,body:{run_id:randomUUID(),batch_id:randomUUID(),template_id:id,
        inputs:{aspect_ratio:'1:1',copy:{dish:'sample'}}}})
      expect(adapter.calls.slice(-2).map(c=>c.prompt)).toEqual(Array(2).fill(body.replace('{{dish}}','sample')))
      expect(routes.slice(-2)).toEqual([binding,binding])
      receipts.push({job:job.id,run:run.id,version})
    }
    for (const receipt of receipts) {
      const {rows} = await pg.query(`select (j.inputs->>'prompt_version')::integer as job,r.prompt_version as trial
        from public.generation_jobs j,public.admin_test_runs r where j.id=$1 and r.id=$2`,[receipt.job,receipt.run])
      expect(rows[0]).toEqual({job:receipt.version,trial:receipt.version})
    }
  } finally { await unlock(); await pg.end() }
},120_000)

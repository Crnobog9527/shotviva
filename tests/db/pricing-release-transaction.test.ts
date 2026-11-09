import { readFileSync } from 'node:fs'
import type { Client } from 'pg'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { connectAdmin, createUser, profileOf } from './helpers'

let db: Client
beforeAll(async () => { db = await connectAdmin() })
afterAll(async () => { await db.end() })

// Run the same bounded transaction body used by the protected workflow. Substituting
// ONLY the approved cohort identifies the isolated local fixture instead of real users.
function body(name: string) {
  return readFileSync('scripts/release/pricing-v2/' + name + '.sql','utf8')
    .replace(/^begin;$/m,'').replace(/^commit;$/m,'')
}
async function localBatch() {
  const totals = (await db.query(`select admin.wallet_digest_v2() as digest,
   (select coalesce(max(id),0) from public.credit_ledger) as tip,(select count(*) from public.payments) as payments`)).rows[0]
  return body('production').replace(/'[a-f0-9]{64}',37,1/, "'" + totals.digest + "'," + totals.tip + "," + totals.payments)
}

it('does not partially clear an approved wallet when a template cannot switch; successful switch and undo balance', async () => {
  await db.query('begin')
  try {
    await db.query("select pg_advisory_xact_lock(hashtextextended('shotviva.template_catalog',0))")
    await db.query('truncate public.profiles cascade')
    await db.query('update public.templates set is_active=false,featured_rank=null')
    await db.query('update public.ai_providers set is_active=false')
    await db.query("insert into public.template_prompts(template_id,body) select id,'fixture' from public.templates where id in ('edit','freeform') on conflict do nothing")
    const buyer = await createUser(db)
    await db.query("select public.admin_adjust_credits($1,124,'fixture','paid')",[buyer])
    await db.query("select public.admin_adjust_credits($1,26,'fixture','free')",[buyer])
    const release = await localBatch()
    await db.query('savepoint start_cutover')
    await expect(db.query(release)).rejects.toThrow('TEMPLATE_MODEL_NOT_READY')
    await db.query('rollback to start_cutover')
    expect((await db.query("select admin.is_template_catalog_v2() as active")).rows[0].active).toBe(false)
    expect(await profileOf(db,buyer)).toMatchObject({ credits:124, free_credits:26 })
    await db.query(`insert into public.ai_providers(label,model,adapter,is_active,resolutions,base_url)
      values('release test','gpt-image-2.6-sunburst','openai_images',true,'{1k,2k,3k}','https://api.openai.com/v1')`)
    await db.query(release)
    expect((await db.query('select admin.is_template_catalog_v2() as active')).rows[0].active).toBe(true)
    expect(await profileOf(db,buyer)).toMatchObject({ credits:0, free_credits:0 })
    await db.query(body('production-rollback'))
    expect((await db.query('select admin.is_template_catalog_v2() as active')).rows[0].active).toBe(false)
    expect(await profileOf(db,buyer)).toMatchObject({ credits:124, free_credits:26 })
  } finally { await db.query('rollback') }
})

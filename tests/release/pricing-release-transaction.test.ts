import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import type { Client } from 'pg'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createUser, profileOf } from '../db/helpers'
import { cloneLocalPricingDb } from './local-pricing-clone'

let db: Client
let clone: ReturnType<typeof cloneLocalPricingDb>
beforeAll(async () => {
  clone = cloneLocalPricingDb()
  db = await clone.connect()
}, 30000)
afterAll(async () => {
  try { await db?.end() } finally { clone?.drop() }
})

// Use the same renderer and SQL that the protected workflow runs.
function body(name: string) {
  return readFileSync('scripts/release/pricing-v2/' + name + '.sql','utf8')
}
function render(snapshot: unknown) {
  return execFileSync('python3', ['scripts/release/pricing-v2/render-production.py'], {
    encoding: 'utf8', env: { ...process.env, PRICING_V2_APPROVED_BASELINE: JSON.stringify(snapshot) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

async function localBaseline() {
  const { rows: [totals] } = await db.query(`select admin.wallet_digest_v2() as digest,
    count(*)::integer as accounts, coalesce(sum(credits),0)::integer as paid_credits,
    coalesce(sum(free_credits),0)::integer as free_credits,
    (select coalesce(max(id),0)::integer from public.credit_ledger) as last_ledger,
    (select count(*)::integer from public.payments) as payments from public.profiles`)
  return totals
}

it('does not partially clear an approved wallet when a template cannot switch; successful switch and undo balance', async () => {
  await db.query('begin')
  await db.query("delete from public.system_settings where key='pricing_catalog_version'")
  try {
    await db.query("select pg_advisory_xact_lock(hashtextextended('shotviva.template_catalog',0))")
    await db.query('truncate public.profiles cascade')
    await db.query('update public.templates set is_active=false,featured_rank=null')
    await db.query('update public.ai_providers set is_active=false')
    await db.query("insert into public.template_prompts(template_id,body) select id,'fixture' from public.templates where id in ('edit','freeform') on conflict do nothing")
    const buyer = await createUser(db)
    await db.query("select public.admin_adjust_credits($1,83,'fixture','paid')",[buyer])
    await db.query("select public.admin_adjust_credits($1,19,'fixture','free')",[buyer])
    const snapshot = await localBaseline()
    expect(() => render({ ...snapshot, digest: "'); select 1; --" })).toThrow()
    expect(() => render({ ...snapshot, accounts: -1 })).toThrow()
    const release = render(snapshot)
    await db.query('savepoint start_cutover')
    await expect(db.query(render({ ...snapshot, paid_credits: snapshot.paid_credits + 1 }))).rejects.toThrow('CUTOVER_BASELINE_CHANGED')
    await db.query('rollback to start_cutover')
    await expect(db.query({ name: 'production', text: release })).rejects.toThrow('TEMPLATE_MODEL_NOT_READY')
    await db.query('rollback to start_cutover')
    expect((await db.query("select admin.is_template_catalog_v2() as active")).rows[0].active).toBe(false)
    expect(await profileOf(db,buyer)).toMatchObject({ credits:83, free_credits:19 })
    await db.query(`insert into public.ai_providers(label,model,adapter,is_active,resolutions,base_url)
      values('release test','gpt-image-2.6-sunburst','openai_images',true,'{1k,2k,3k}','https://api.openai.com/v1')`)
    await db.query({ name: 'production', text: release })
    expect((await db.query('select admin.is_template_catalog_v2() as active')).rows[0].active).toBe(true)
    await db.query({ name: 'production', text: release })
    expect(await profileOf(db,buyer)).toMatchObject({ credits:0, free_credits:0 })
    await db.query({ name: 'production-rollback', text: body('production-rollback') })
    expect((await db.query('select admin.is_template_catalog_v2() as active')).rows[0].active).toBe(false)
    expect(await profileOf(db,buyer)).toMatchObject({ credits:83, free_credits:19 })
  } finally { await db.query('rollback') }
})

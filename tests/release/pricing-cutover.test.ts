import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { Client } from 'pg'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { createUser, ledgerOf, profileOf } from '../db/helpers'
import { cloneLocalPricingDb } from './local-pricing-clone'

let clone: ReturnType<typeof cloneLocalPricingDb>
let release: Client
let callback: Client
let buyer: string
const script = (op: string) => readFileSync('scripts/release/pricing-v2/' + op + '.sql', 'utf8')
const version = async () => (await release.query('select admin.is_template_catalog_v2() as v2')).rows[0].v2
const pay = (key: string, v2 = false) => callback.query('select * from public.settle_checkout' + (v2 ? '_v2' : '') +
  "($1,'pack_m',$2,2490,'usd',0,'card')", [buyer, key])

beforeAll(async () => {
  clone = cloneLocalPricingDb()
  release = await clone.connect()
  callback = await clone.connect()
  // These changes apply only to our disposable copy. Accept a source previously used for v2 QA.
  await release.query(`delete from public.system_settings where key='pricing_catalog_version';
    truncate admin.pricing_release_checkpoint, admin.template_price_batches cascade;
    truncate public.profiles cascade;
    update public.templates set is_active=false, featured_rank=null;
    update public.ai_providers set is_active=false;
    insert into public.ai_providers(label,model,adapter,is_active,resolutions,base_url)
      values('cutover test','gpt-image-2.6-sunburst','openai_images',true,'{1k,2k,3k}','https://api.openai.com/v1');
    insert into public.template_prompts(template_id,body) select t.id,'fixture'
      from public.templates t join admin.template_tariffs_v2 c on c.id=t.id
      on conflict(template_id) do update set provider_id=null;`)
  buyer = await createUser(release)
}, 30000)

afterAll(async () => {
  try { await Promise.all([release?.end(), callback?.end()]) } finally { clone?.drop() }
})

// Prove PostgreSQL observed the competing backend at the shared/exclusive advisory lock.
async function waitForAdvisoryLock(holder: Client, waiterPid: number) {
  await vi.waitFor(async () => {
    const { rows } = await holder.query(`select exists(select from pg_locks where pid=$1
      and locktype='advisory' and not granted) and pg_backend_pid()=any(pg_blocking_pids($1)) as blocked`, [waiterPid])
    expect(rows[0].blocked).toBe(true)
  }, { timeout: 3000, interval: 20 })
}

it('serializes both arrival orders and refuses preview rollback after a new payment', async () => {
  const first = 'cs_' + randomUUID()
  const second = 'cs_' + randomUUID()
  const releasePid = (await release.query('select pg_backend_pid() as pid')).rows[0].pid
  const callbackPid = (await callback.query('select pg_backend_pid() as pid')).rows[0].pid
  await callback.query('begin')
  expect((await pay(first)).rows[0]).toMatchObject({ applied: true, credits: 55 })
  const switching = release.query(script('preview'))
  try { await waitForAdvisoryLock(callback, releasePid) } finally {
    await callback.query('commit')
    await switching
  }
  expect((await pay(first)).rows[0]).toMatchObject({ applied: false, credits: 55 })
  await release.query(script('preview-rollback'))
  expect(await version()).toBe(false)
  await expect(pay(second, true)).rejects.toThrow('PRICING_VERSION_RECONCILIATION_REQUIRED')

  // Hold the real release transaction just before COMMIT. The waiting old tab's
  // callback must read the newly committed wallet denomination.
  await release.query(script('preview').replace(/^commit;$/m, ''))
  const waiting = pay(second)
  try { await waitForAdvisoryLock(release, callbackPid) } finally {
    await release.query('commit')
    await waiting
  }
  expect((await pay(second)).rows[0]).toMatchObject({ applied: false, credits: 2545 })
  expect((await ledgerOf(release, buyer)).map(row => row.delta)).toEqual([55, 2490])
  expect((await release.query('select count(*)::int as n from public.payments where user_id=$1', [buyer])).rows[0].n).toBe(2)
  await expect(release.query(script('preview-rollback'))).rejects.toThrow('ECONOMIC_ACTIVITY_AFTER_CUTOVER')
  await release.query('rollback')
  expect(await version()).toBe(true)
  expect((await profileOf(release, buyer)).credits).toBe(2545)
})

it('grants exactly one new signup gift when two verified users on the same IP claim concurrently', async () => {
  await release.query(script('preview'))
  const ids = [await createUser(release), await createUser(callback)]
  await release.query("update profiles set signup_ip='192.0.2.7' where id=any($1::uuid[])", [ids])
  const gift = (db: Client, id: string) => db.query(
    "select * from grant_credits($1::uuid,6,'signup','signup:'||($1::uuid)::text,'free')", [id])
  const claims = await Promise.all([gift(release, ids[0]), gift(callback, ids[1])])
  expect(claims.map(r => r.rows[0].free_credits).sort((a, b) => a - b)).toEqual([0, 100])
  for (const id of ids) expect((await gift(callback, id)).rows[0].applied).toBe(false)
})

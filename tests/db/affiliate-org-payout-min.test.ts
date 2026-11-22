import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

import { promoter, row } from './affiliate-fixtures'
import { connectAdmin, createUser } from './helpers'

// The enterprise payout threshold (1880, ARCHITECTURE §6.5): affiliate_daily settles an org
// account against affiliate_settings.org_payout_min_usd and a personal account against
// payout_min_usd; admin_affiliate_settings saves the new field, admins only.

let db: Client
let actor: string
beforeAll(async () => { db = await connectAdmin() })
beforeEach(async () => {
  await db.query('begin')
  await db.query('update affiliate_settings set enabled=true,settlement_day=1')
  actor = await createUser(db)
  await db.query("update profiles set role='admin' where id=$1", [actor])
})
afterEach(async () => { await db.query('rollback') })
afterAll(async () => { await db.end() })

async function orgAccount() {
  const owner = await createUser(db)
  const input = { owner_user_id: owner, name: 'Org ' + owner.slice(0, 8), affiliate_enabled: true }
  await db.query('select admin_org_create($1,$2)', [actor, input])
  return owner
}
// Both accounts hold the same confirmed balance and a payout method.
async function withBalance(user: string, cents: number) {
  await db.query("update affiliates set payout_method='bank',payout_details='fixture' where user_id=$1", [user])
  await db.query("insert into affiliate_adjustments(request_id,affiliate_user_id,amount,reason) values(gen_random_uuid(),$1,$2,'fixture')", [user, cents])
}
const settle = () => db.query("select affiliate_daily('2031-05-01')")
const issued = async (user: string) =>
  (await db.query('select amount::int from affiliate_payouts where affiliate_user_id=$1', [user])).rows.map((r) => r.amount)
const setThresholds = (personal: number, org: number) =>
  db.query('update affiliate_settings set payout_min_usd=$1,org_payout_min_usd=$2', [personal, org])

it('starts at the personal threshold', async () => {
  expect(await row(db, 'select payout_min_usd=org_payout_min_usd as same from affiliate_settings')).toEqual({ same: true })
})

it('does not settle an org account below the org threshold while a personal account at the same balance settles', async () => {
  const org = await orgAccount()
  const personal = (await promoter(db)).id
  await withBalance(org, 30000)
  await withBalance(personal, 30000)
  await setThresholds(20000, 50000)
  await settle()
  expect(await issued(org)).toEqual([])
  expect(await issued(personal)).toEqual([30000])
})

it('settles an org account that reaches the org threshold while a personal account below its own carries over', async () => {
  const org = await orgAccount()
  const personal = (await promoter(db)).id
  await withBalance(org, 30000)
  await withBalance(personal, 30000)
  await setThresholds(50000, 20000)
  await settle()
  expect(await issued(org)).toEqual([30000])
  expect(await issued(personal)).toEqual([])
})

it('saves the org threshold from the admin form, keeps it when absent and audits the save; non-admins are refused', async () => {
  const save = (who: string, input: object) => db.query('select admin_affiliate_settings($1,$2)', [who, input])
  await save(actor, { payout_min_usd: 20000, org_payout_min_usd: 100000, terms_version: 'ignored' })
  expect(await row(db, 'select payout_min_usd::int p,org_payout_min_usd::int o,terms_version<>$1 kept from affiliate_settings', ['ignored']))
    .toEqual({ p: 20000, o: 100000, kept: true })
  // The form deployed before 1880 never sends the field.
  await save(actor, { payout_min_usd: 25000 })
  expect(await row(db, 'select payout_min_usd::int p,org_payout_min_usd::int o from affiliate_settings')).toEqual({ p: 25000, o: 100000 })
  const audit = await row(db, "select reason from admin_audit_log where action='affiliate_settings' and user_id=$1 order by created_at,id limit 1", [actor])
  expect(JSON.parse(audit.reason)).toEqual({ payout_min_usd: 20000, org_payout_min_usd: 100000 })

  await db.query('savepoint refused')
  await expect(db.query('update affiliate_settings set org_payout_min_usd=0')).rejects.toThrow('check')
  await db.query('rollback to savepoint refused')
  const user = await createUser(db)
  await db.query('savepoint refused')
  await expect(save(user, { org_payout_min_usd: 1 })).rejects.toThrow('NOT_ADMIN')
  await db.query('rollback to savepoint refused')
  expect(await row(db, 'select org_payout_min_usd::int o from affiliate_settings')).toEqual({ o: 100000 })
})

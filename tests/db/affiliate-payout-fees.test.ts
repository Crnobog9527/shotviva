import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { available, row, setupAffiliate } from './affiliate-fixtures'
import { connectAdmin, createUser } from './helpers'

let db: Client
let f: Awaited<ReturnType<typeof setupAffiliate>>
beforeAll(async () => { db = await connectAdmin() })
beforeEach(async () => { await db.query('begin'); f = await setupAffiliate(db) })
afterEach(async () => { await db.query('rollback') })
afterAll(async () => { await db.end() })

const percentFixed = { label_zh: '提现手续费', label_en: 'Withdrawal fee', kind: 'percent_fixed', percent_bp: 350, fixed_cents: 50 }
async function saveRule(input: object, actor = f.actor) {
  return Number((await row(db, 'select admin_affiliate_fee_rule_save($1,$2) as id', [actor, input])).id)
}
async function quote(rules: object[], gross: number) {
  return (await row(db, 'select affiliate_payout_fee_quote($1::jsonb,$2) as q', [JSON.stringify(rules), gross])).q
}
async function issue(cents: number, method = 'wise', day = '2031-02-01') {
  await db.query('update affiliates set payout_method=$2,payout_details=$3 where user_id=$1', [f.owner.id, method, 'fixture'])
  await db.query("insert into affiliate_adjustments(request_id,affiliate_user_id,amount,reason) values(gen_random_uuid(),$1,$2,'fixture')", [f.owner.id, cents])
  await db.query('select affiliate_daily($1)', [day])
  return row(db, 'select id,amount::int,fee_rules,fee_amount,fee_lines from affiliate_payouts where affiliate_user_id=$1 order by id desc limit 1', [f.owner.id])
}
const decide = (input: object) => db.query('select admin_affiliate_payout_decide($1,$2)', [f.actor, input])
const paid = (id: string, extra: object = {}) =>
  decide({ payout_id: id, status: 'paid', method: 'wise', paid_at: '2031-02-02', paid_reference: 'fixture', ...extra })
async function refused(run: () => Promise<unknown>, message: string) {
  await db.query('savepoint refused')
  await expect(run()).rejects.toThrow(message)
  await db.query('rollback to savepoint refused')
}

it('computes each rule on the gross, rounds half up to the cent, clamps to min/max and never exceeds the gross', async () => {
  const r = (x: object) => ({ id: 1, label_zh: 'x', label_en: 'x', min_cents: null, max_cents: null, percent_bp: 0, fixed_cents: 0, ...x })
  expect(await quote([r({ percent_bp: 350, fixed_cents: 50 })], 23510)).toMatchObject({ gross: 23510, fees: 873, net: 22637 })
  expect((await quote([r({ percent_bp: 5000 })], 1)).fees).toBe(1)
  expect((await quote([r({ percent_bp: 4999 })], 1)).fees).toBe(0)
  expect((await quote([r({ percent_bp: 100, min_cents: 300 })], 20000)).fees).toBe(300)
  expect((await quote([r({ percent_bp: 1000, max_cents: 1500 })], 20000)).fees).toBe(1500)
  const capped = await quote([r({ fixed_cents: 15000 }), r({ id: 2, fixed_cents: 9000 }), r({ id: 3, fixed_cents: 100 })], 20000)
  expect(capped).toMatchObject({ fees: 20000, net: 0 })
  expect(capped.lines.map((l: { amount: number }) => l.amount)).toEqual([15000, 5000, 0])
  expect(await quote([r({ fixed_cents: 50 })], 0)).toMatchObject({ fees: 0, net: 0 })
  expect(await quote([], 20000)).toMatchObject({ fees: 0, net: 20000, lines: [] })
})

it('copies only the rules in force for the payout method at issue; later edits leave the statement alone', async () => {
  const general = await saveRule({ ...percentFixed, sort_order: 1 })
  await saveRule({ label_zh: '国际电汇费', label_en: 'International wire fee', kind: 'fixed', fixed_cents: 2500, payout_methods: ['bank'] })
  await saveRule({ label_zh: '停用', label_en: 'Off', kind: 'fixed', fixed_cents: 100, active: false })
  await saveRule({ label_zh: '未来', label_en: 'Later', kind: 'fixed', fixed_cents: 100, effective_from: '2031-03-01T00:00:00Z' })
  const statement = await issue(23510)
  expect(statement.fee_rules.map((r: { id: number }) => r.id)).toEqual([general])
  const edited = await row(db, 'select updated_at::text from affiliate_payout_fee_rules where id=$1', [general])
  await saveRule({ ...percentFixed, id: general, percent_bp: 900, expected_updated_at: edited.updated_at })
  const after = await row(db, 'select fee_rules from affiliate_payouts where id=$1', [statement.id])
  expect(after.fee_rules[0]).toMatchObject({ percent_bp: 350, fixed_cents: 50 })
})

it('bank payouts carry the bank-only wire fee as well, in sort order', async () => {
  await saveRule({ label_zh: '国际电汇费', label_en: 'International wire fee', kind: 'fixed', fixed_cents: 2500, payout_methods: ['bank'], sort_order: 2 })
  await saveRule({ ...percentFixed, sort_order: 1 })
  const statement = await issue(23510, 'bank')
  expect(statement.fee_rules.map((r: { label_en: string }) => r.label_en)).toEqual(['Withdrawal fee', 'International wire fee'])
})

it('pays the net: records gross, each deduction and net; the balance is consumed by the gross as before', async () => {
  await saveRule(percentFixed)
  const statement = await issue(23510)
  expect(await available(db, f.owner.id)).toBe(0)
  await refused(() => paid(statement.id, { expected_amount: 23510 }), 'AFFILIATE_PAYOUT_AMOUNT_CHANGED')
  await refused(() => paid(statement.id, { expected_amount: 23510, expected_net: 23510 }), 'AFFILIATE_PAYOUT_AMOUNT_CHANGED')
  const preview = await row(db, 'select affiliate_payout_fees(p) as q from affiliate_payouts p where id=$1', [statement.id])
  expect(preview.q).toMatchObject({ gross: 23510, fees: 873, net: 22637 })
  await paid(statement.id, { expected_amount: 23510, expected_net: 22637 })
  const done = await row(db, 'select paid_amount::int,fee_amount::int,fee_lines,affiliate_payout_fees(p) as q from affiliate_payouts p where id=$1', [statement.id])
  expect(done).toMatchObject({ paid_amount: 23510, fee_amount: 873 })
  expect(done.fee_lines).toEqual([expect.objectContaining({ label_en: 'Withdrawal fee', amount: 873 })])
  expect(done.q).toMatchObject({ gross: 23510, fees: 873, net: 22637 })
  expect(await row(db, 'select paid::int,available::int from affiliate_balances where affiliate_user_id=$1', [f.owner.id])).toEqual({ paid: 23510, available: 0 })
  const audit = await row(db, "select reason from admin_audit_log where action='affiliate_payout_decide' and target_id=$1", [String(statement.id)])
  expect(audit.reason).toContain('fees 873 net 22637')
})

it('applies the issued rules to the amount payable at payment, after a later reduction', async () => {
  await saveRule(percentFixed)
  const statement = await issue(23510)
  await db.query("insert into affiliate_adjustments(request_id,affiliate_user_id,amount,reason) values(gen_random_uuid(),$1,-3510,'clawback')", [f.owner.id])
  const preview = await row(db, 'select affiliate_payout_payable(p)::int as gross,affiliate_payout_fees(p) as q from affiliate_payouts p where id=$1', [statement.id])
  expect(preview.gross).toBe(20000)
  expect(preview.q).toMatchObject({ gross: 20000, fees: 750, net: 19250 })
  await paid(statement.id, { expected_amount: 20000, expected_net: 19250 })
  expect(await row(db, 'select paid_amount::int,fee_amount::int from affiliate_payouts where id=$1', [statement.id])).toEqual({ paid_amount: 20000, fee_amount: 750 })
})

it('refuses to mark paid when fees take the whole payout; hold and void still work', async () => {
  await saveRule({ label_zh: '杂费', label_en: 'Misc', kind: 'fixed', fixed_cents: 30000 })
  const statement = await issue(23510)
  await refused(() => paid(statement.id, { expected_amount: 23510, expected_net: 0 }), 'AFFILIATE_PAYOUT_NET_ZERO')
  await decide({ payout_id: statement.id, status: 'held', note: 'fix fee rules' })
  await decide({ payout_id: statement.id, status: 'void', note: 'reissue', void_mode: 'return' })
  expect(await available(db, f.owner.id)).toBe(23510)
})

it('statements issued before the release (no stored rules) or before any rule keep paying exactly as before', async () => {
  const legacy = await issue(23510)
  await db.query('update affiliate_payouts set fee_rules=null where id=$1', [legacy.id])
  await saveRule(percentFixed)
  await paid(legacy.id, { expected_amount: 23510 })
  expect(await row(db, 'select paid_amount::int,fee_amount,fee_lines,affiliate_payout_fees(p) as q from affiliate_payouts p where id=$1', [legacy.id]))
    .toEqual({ paid_amount: 23510, fee_amount: null, fee_lines: null, q: { gross: 23510, fees: 0, net: 23510, lines: [] } })
  expect(await row(db, 'select paid::int,available::int from affiliate_balances where affiliate_user_id=$1', [f.owner.id])).toEqual({ paid: 23510, available: 0 })

  await db.query("update affiliate_payout_fee_rules set active=false")
  const empty = await issue(25000, 'wise', '2031-03-01')
  expect(empty.fee_rules).toEqual([])
  await db.query('update affiliate_payout_fee_rules set active=true')
  await paid(empty.id, { expected_amount: 25000 })
  expect(await row(db, 'select fee_amount::int from affiliate_payouts where id=$1', [empty.id])).toEqual({ fee_amount: 0 })
})

it('only an unbanned admin saves rules; every save is audited; a stale edit is refused', async () => {
  const stranger = await createUser(db)
  await refused(() => saveRule(percentFixed, stranger), 'NOT_ADMIN')
  await db.query('update profiles set banned_at=now() where id=$1', [f.actor])
  await refused(() => saveRule(percentFixed), 'NOT_ADMIN')
  await db.query('update profiles set banned_at=null where id=$1', [f.actor])
  const id = await saveRule(percentFixed)
  await refused(() => saveRule({ ...percentFixed, id, expected_updated_at: '2000-01-01T00:00:00Z' }), 'AFFILIATE_FEE_RULE_CHANGED')
  await refused(() => saveRule({ ...percentFixed, kind: 'percent' }), 'affiliate_payout_fee_rules_shape')
  await refused(() => saveRule({ ...percentFixed, payout_methods: ['cash'] }), 'payout_methods_check')
  await refused(() => saveRule({ ...percentFixed, min_cents: 500, max_cents: 100 }), 'affiliate_payout_fee_rules_bounds')
  const audit = await row(db, "select user_id,reason from admin_audit_log where action='affiliate_settings' and target_id=$1", ['fee_rule:' + id])
  expect(audit.user_id).toBe(f.actor)
  expect(JSON.parse(audit.reason)).toMatchObject({ fee_rule: id, before: null, after: { percent_bp: 350, active: true } })
})

it('clients cannot read the rules or call any fee function; only the service role can', async () => {
  const fns = [
    'admin_affiliate_fee_rule_save(uuid,jsonb)', 'affiliate_partner_fees(uuid)', 'affiliate_payout_fee_quote(jsonb,bigint)',
    'affiliate_payout_fee_rules_for(text,text,timestamptz)', 'affiliate_payout_fees(affiliate_payouts)',
  ]
  for (const fn of fns)
    expect(await row(db, `select has_function_privilege('anon',$1,'execute') a,has_function_privilege('authenticated',$1,'execute') u,
      has_function_privilege('service_role',$1,'execute') s`, [fn])).toEqual({ a: false, u: false, s: true })
  expect(await row(db, `select has_function_privilege('service_role','_affiliate_fee_rule_json(affiliate_payout_fee_rules)','execute') s`)).toEqual({ s: false })
  expect(await row(db, `select has_table_privilege('authenticated','affiliate_payout_fee_rules','select') u,
    has_table_privilege('service_role','affiliate_payout_fee_rules','insert') w`)).toEqual({ u: false, w: false })
})

it('shows the affiliate every rule in force and the estimate for their balance and method', async () => {
  await saveRule({ ...percentFixed, sort_order: 1 })
  await saveRule({ label_zh: '国际电汇费', label_en: 'International wire fee', kind: 'fixed', fixed_cents: 2500, payout_methods: ['bank'], sort_order: 2 })
  await db.query("insert into affiliate_adjustments(request_id,affiliate_user_id,amount,reason) values(gen_random_uuid(),$1,20000,'fixture')", [f.owner.id])
  const none = (await row(db, 'select affiliate_partner_fees($1) as v', [f.owner.id])).v
  expect(none.method).toBeNull()
  expect(none.rules).toHaveLength(2)
  expect(none.estimate).toMatchObject({ gross: 20000, fees: 750, net: 19250 })
  await db.query("update affiliates set payout_method='bank' where user_id=$1", [f.owner.id])
  const bank = (await row(db, 'select affiliate_partner_fees($1) as v', [f.owner.id])).v
  expect(bank.estimate).toMatchObject({ gross: 20000, fees: 3250, net: 16750 })
})

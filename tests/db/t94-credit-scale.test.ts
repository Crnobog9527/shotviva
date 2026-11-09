import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

import { campaignCatalog, type CatalogInput } from '@/core/codes/admin'
import { site } from '@/site/site.config'

import { benefits, invite, pack } from '../t94-config'
import { connectAdmin, createUser, ledgerOf, profileOf } from './helpers'

// ×100 changes credit quantities only. Prices, percentages, windows and reward counts
// retain their own units. All fixtures, including global policy edits, are private to this
// connection's uncommitted transaction; other tests continue to read the deployed defaults.
const factor = 100
const products = site.billing.products.map(product => ({ ...product, credits: product.credits * factor }))
const codeName = () => randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()
let db: Client
let actor: string

beforeAll(async () => { db = await connectAdmin() })
beforeEach(async () => {
  await db.query('begin')
  actor = await createUser(db)
  await db.query("update public.profiles set role='admin' where id=$1", [actor])
})
afterEach(async () => { await db.query('rollback') })
afterAll(async () => { await db.end() })

async function save(fields: Record<string, unknown>, catalogProducts: readonly CatalogInput[] = products, id: string = randomUUID()) {
  const { catalog, floor } = campaignCatalog(catalogProducts)
  const result = await db.query('select public.admin_save_code($1,$2,$3,$4,$5) as id',
    [actor, id, fields, JSON.stringify(catalog), floor.id])
  return result.rows[0].id as string
}

async function reject(work: () => Promise<unknown>, message: string) {
  await db.query('savepoint expected_rejection')
  try {
    await expect(work()).rejects.toMatchObject({ message })
  } finally {
    await db.query('rollback to savepoint expected_rejection')
    await db.query('release savepoint expected_rejection')
  }
}

async function redeem(user: string, code: string) {
  const result = await db.query("select public.redeem_code($1,$2,'account',$3,$4) as claim",
    [user, code, invite.inviteeCredits * factor, invite.windowDays])
  return result.rows[0].claim
}

type GiftPolicy = { maxCreditsPerCode: number; requirePaidGiftCap: boolean }
async function setGiftPolicy(policy: GiftPolicy) {
  await db.query("select public.admin_set_system_setting('code_gift_policy',$1,$2)", [JSON.stringify(policy), actor])
}

it('scales the configured per-code gift limit and honors both paid-cap policies without invalidating existing terms', async () => {
  const { rows: [setting] } = await db.query<{ value: GiftPolicy }>("select value from public.system_settings where key='code_gift_policy'")
  await db.query('update public.profiles set banned_at=now() where id=$1', [actor])
  await reject(() => setGiftPolicy(setting.value), 'NOT_ADMIN')
  await db.query('update public.profiles set banned_at=null where id=$1', [actor])
  await reject(() => setGiftPolicy({ maxCreditsPerCode: 0, requirePaidGiftCap: true }), 'INVALID_INPUT')
  const max = setting.value.maxCreditsPerCode * factor
  await setGiftPolicy({ maxCreditsPerCode: max, requirePaidGiftCap: true })
  const fields = { code: codeName(), invitee_pool: 'paid', invitee_credits: max }
  await reject(() => save(fields), 'CODE_GIFT_CAP_REQUIRED')
  await reject(() => save({ ...fields, invitee_credits: max + 1, max_redemptions: 1 }), 'CODE_GIFT_LIMIT')
  await save({ ...fields, code: codeName(), max_redemptions: 1 })
  await setGiftPolicy({ maxCreditsPerCode: max, requirePaidGiftCap: false })
  const id = await save(fields)
  await setGiftPolicy({ ...setting.value, requirePaidGiftCap: true })
  expect(await save({ note: 'change label after tightening limits' }, products, id)).toBe(id)
  const user = await createUser(db)
  expect(await redeem(user, fields.code)).toMatchObject({ status: 'ok', credits_granted: max, pool: 'paid' })
  expect((await profileOf(db, user)).credits).toBe(max)
  expect(await ledgerOf(db, user)).toEqual([expect.objectContaining({ kind: 'code_grant', pool: 'paid', delta: max })])
})

function discount(id: string, percent: number) {
  return { code: codeName(), discount_products: [id], discount_percent: percent, discount_duration: 'once', stripe_coupon_id: codeName() }
}

it('uses the supplied catalogue at the exact floor; the legacy signature reads the database mirror', async () => {
  const { floor } = campaignCatalog(products)
  // A target costing twice the minimum subscription per credit meets the floor at 50% off.
  const target = products.find(product => product.id !== floor.id && product.tier !== 'pack')!
  const adjusted = (offsetCents: number) => products.map(product => product.id === target.id
    ? { ...product, credits: floor.credits, priceUsd: (floor.priceCents * 2 + offsetCents) / 100 }
    : product)
  const fields = discount(target.id, 50)
  const allowed = await save(fields, adjusted(0))
  await reject(() => save(discount(target.id, 50), adjusted(-1)), 'CODE_DISCOUNT_PRODUCTS')
  await reject(() => save(discount(floor.id, 1)), 'CODE_DISCOUNT_PRODUCTS')
  // Existing terms survive a later catalog change that rejects a new identical offer.
  expect(await save({ note: 'existing campaign' }, adjusted(-1), allowed)).toBe(allowed)
  expect(await redeem(await createUser(db), fields.code)).toMatchObject({ status: 'ok', discount_percent: 50 })
  const legacySave = (offer: ReturnType<typeof discount>) => db.query(
    'select public.admin_save_code($1,$2,$3) as id', [actor, randomUUID(), offer])
  // Simulate the catalog sync a real change to the denomination would deploy.
  for (const p of adjusted(0)) await db.query('update public.products set price_usd=$2, credits=$3 where id=$1', [p.id, p.priceUsd, p.credits])
  expect((await legacySave(discount(target.id, 50))).rows[0].id).toBeTruthy()
  await db.query('update public.products set price_usd=price_usd-0.01 where id=$1', [target.id])
  await reject(() => legacySave(discount(target.id, 50)), 'CODE_DISCOUNT_PRODUCTS')
})

async function referredBuyer(code: string) {
  const buyer = await createUser(db)
  // Signup is versioned by the database; scaling invite rewards cannot scale that gift.
  const signup = benefits.freeCredits
  await db.query("select public.grant_credits($1,$2,'signup',$3,'free')", [buyer, signup, 'signup:' + buyer])
  expect(await redeem(buyer, code)).toMatchObject({ status: 'ok', credits_granted: invite.inviteeCredits * factor })
  expect((await profileOf(db, buyer)).free_credits).toBe(signup + invite.inviteeCredits * factor)
  return buyer
}

async function purchase(buyer: string) {
  const session = 'cs_' + randomUUID()
  const cents = Math.round(pack.priceUsd * 100)
  await db.query("select public.settle_checkout($1,$2,$3,$4,'usd',0,'card',null,$5)",
    [buyer, pack.id, session, cents, 'ch_' + randomUUID()])
  const { rows: [row] } = await db.query('select id from public.payments where stripe_session_id=$1', [session])
  const { rows: [effects] } = await db.query('select public.apply_payment_code_effects($1,$2,null,0,$3,$4) as value',
    [buyer, row.id, invite.inviterCredits * factor, invite.inviterRewardCap])
  return effects.value.rewarded as boolean
}

it('keeps the legacy signup gift and grants scaled purchase and inviter credits while enforcing the configured reward count and accounting window', async () => {
  const inviter = await createUser(db)
  await db.query('update public.products set credits=$2 where id=$1', [pack.id, pack.credits * factor])
  const summary = async () => (await db.query('select public.my_invite_summary($1,$2) as value',
    [inviter, invite.inviterRewardCap])).rows[0].value
  const { code, reward_window_days: defaultDays } = await summary()
  expect(Number.isSafeInteger(defaultDays)).toBe(true)
  const days = defaultDays + 2
  const setDays = (value: number) => db.query("select public.admin_set_system_setting('code_inviter_window_days',$1,$2)",
    [JSON.stringify(value), actor])
  await reject(() => setDays(0), 'INVALID_INPUT')
  await setDays(days)
  const first = await referredBuyer(code)
  expect(await purchase(first)).toBe(true)
  expect((await profileOf(db, first)).credits).toBe(pack.credits * factor)
  expect(await purchase(first)).toBe(false)
  for (let i = 1; i < invite.inviterRewardCap; i++) expect(await purchase(await referredBuyer(code))).toBe(true)
  const earned = invite.inviterCredits * factor * invite.inviterRewardCap
  expect((await profileOf(db, inviter)).credits).toBe(earned)
  // The same rewards would have expired under the old window but still count in the new one.
  await db.query("update public.credit_ledger set created_at=now()-make_interval(days=>$2) where user_id=$1 and kind='invite_reward'",
    [inviter, defaultDays + 1])
  expect(await summary()).toMatchObject({ earned, rewards_left: 0, reward_window_days: days })
  expect(await purchase(await referredBuyer(code))).toBe(false)
  await db.query("update public.credit_ledger set created_at=now()-make_interval(days=>$2) where user_id=$1 and kind='invite_reward'",
    [inviter, days + 1])
  expect(await summary()).toMatchObject({ rewards_left: invite.inviterRewardCap })
  expect(await purchase(await referredBuyer(code))).toBe(true)
  expect(await summary()).toMatchObject({ earned: earned + invite.inviterCredits * factor, rewards_left: invite.inviterRewardCap - 1 })
}, 30_000)

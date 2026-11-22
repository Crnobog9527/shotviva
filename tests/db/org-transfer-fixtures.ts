import type { Client } from 'pg'

import { invite } from '../t94-config'

import { row, sale } from './affiliate-fixtures'
import { createUser } from './helpers'

// Shared by the admin_org_transfer_owner (1930) test files. `db` and `actor` are read lazily:
// each test file opens its own connection and admin account.
export function transferKit(conn: () => Client, admin: () => string) {
  async function createOrg(owner: string, affiliate = true) {
    const input = { owner_user_id: owner, name: 'Org ' + owner.slice(0, 8), affiliate_enabled: affiliate }
    return (await row(conn(), 'select admin_org_create($1,$2) as id', [admin(), input])).id as string
  }
  async function joinOrg(user: string, orgId: string) {
    const { invite_token } = await row(conn(), 'select invite_token from orgs where id=$1', [orgId])
    await conn().query('select org_join($1,$2)', [user, invite_token])
  }
  const updatedAt = async (orgId: string) => (await row(conn(), 'select updated_at::text as at from orgs where id=$1', [orgId])).at as string
  async function transfer(orgId: string, user: string, opts: { as?: string; expected?: string } = {}) {
    const input = { org_id: orgId, user_id: user, expected_updated_at: opts.expected ?? (await updatedAt(orgId)) }
    return (await row(conn(), 'select admin_org_transfer_owner($1,$2) as r', [opts.as ?? admin(), input])).r
  }
  const role = async (orgId: string, user: string) =>
    row(conn(), 'select role,status,monthly_allowance,held_credits from org_members where org_id=$1 and user_id=$2', [orgId, user])
  const owners = async (orgId: string) =>
    (await conn().query("select user_id from org_members where org_id=$1 and role='owner' and status='active'", [orgId])).rows.map((r) => r.user_id)

  // A new account that signs up with `inviter`'s personal invite code (T94); for an org member
  // it becomes the org's level-1 customer.
  async function invitedBy(inviter: string) {
    const customer = await createUser(conn())
    await conn().query("select grant_credits($1::uuid,6,'signup',$2,'free')", [customer, 'signup:' + customer])
    const { code } = await row(conn(), 'select get_or_create_invite_code($1) as code', [inviter])
    await conn().query("select redeem_code($1,$2,'signup',null,$3)", [customer, code, invite.windowDays])
    return customer
  }

  // An org with the affiliate switch on, a member, one customer each for the owner and the member,
  // a payment, an adjustment, a payout, a rate override and a promo sheet.
  async function channelOrg() {
    const owner = await createUser(conn())
    const orgId = await createOrg(owner)
    const staff = await createUser(conn())
    await joinOrg(staff, orgId)
    const customer = await invitedBy(staff)
    const ownersCustomer = await invitedBy(owner)
    await conn().query("update affiliates set payout_method='bank',payout_details='company account',admin_note='kept' where user_id=$1", [owner])
    await conn().query("insert into affiliate_rate_overrides(user_id,product_kind,l1_bp,l2_bp) values($1,'pack',2000,700)", [owner])
    const paid = await sale(conn(), customer, 'pack_m', 2490)
    await conn().query("insert into affiliate_adjustments(request_id,affiliate_user_id,amount,reason) values(gen_random_uuid(),$1,500,'fixture')", [owner])
    await conn().query("insert into affiliate_payouts(affiliate_user_id,period,amount,status,payout_snapshot) values($1,'2031-04-01',300,'paid','{}')", [owner])
    await conn().query(`insert into partner_promo_grants(org_id,period,status,recipient_user_id,base,bonus,raw_credits,counted_credits,customer_cap,
        customers,capped_customers,clawback_owed,clawback_applied,total,fingerprint,expires_at,decided_at,decided_by)
      values($1,'2031-05','granted',$2,10000,0,0,0,0,0,0,0,0,10000,repeat('a',32),'2031-06-01',now(),$3)`, [orgId, owner, admin()])
    await conn().query('update org_members set monthly_allowance=40,held_credits=0 where org_id=$1 and user_id=$2', [orgId, staff])
    return { owner, orgId, staff, customer, ownersCustomer, paid }
  }

  return { createOrg, joinOrg, updatedAt, transfer, role, owners, invitedBy, channelOrg }
}

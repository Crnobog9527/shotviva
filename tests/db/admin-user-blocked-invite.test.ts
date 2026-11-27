import type { Client } from 'pg'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { userCodeHistory } from '@/core/admin/users/code-history'

import { invite } from '../t94-config'

import { row } from './affiliate-fixtures'
import { connectAdmin, createUser, uniqueIp } from './helpers'
import { serviceSupabase } from './supabase-env'

// The admin user detail shows a refused invite attempt (code, inviter, reason, whether it retries
// when the signup gift is paid), so an admin can see why a customer is not attributed (2031,
// Codex validation 2026-11-27). Fake data only; committed, each test makes its own users.

let db: Client
beforeAll(async () => { db = await connectAdmin() })
afterAll(async () => { await db.end() })

it('shows a sign-up invite refused for the missing gift as retrying, and nothing once it applied', async () => {
  const inviter = await createUser(db)
  const user = await createUser(db)
  const { code } = await row(db, 'select get_or_create_invite_code($1) as code', [inviter])
  expect((await row(db, "select redeem_code($1,$2,'signup',null,$3) as r", [user, code, invite.windowDays])).r.status).toBe('blocked_no_signup_grant')

  const before = await userCodeHistory(serviceSupabase(), user)
  expect(before.inviterId).toBeNull()
  expect(before.blockedInvite).toEqual({ code, inviterId: inviter, status: 'blocked_no_signup_grant', at: expect.any(String), retries: true })

  // The gift arrives: the redemption re-runs (2030), and the detail shows the inviter instead.
  await db.query("select grant_credits($1::uuid,6,'signup',$2,'free')", [user, 'signup:' + user])
  const after = await userCodeHistory(serviceSupabase(), user)
  expect(after).toMatchObject({ inviterId: inviter, inviteCode: code, blockedInvite: null })
})

it('shows a same-network refusal as not retrying', async () => {
  const inviter = await createUser(db)
  const user = await createUser(db)
  await db.query('update profiles set signup_ip=$3 where id in ($1,$2)', [inviter, user, uniqueIp()])
  const { code } = await row(db, 'select get_or_create_invite_code($1) as code', [inviter])
  expect((await row(db, "select redeem_code($1,$2,'signup',null,$3) as r", [user, code, invite.windowDays])).r.status).toBe('blocked_same_ip')
  expect((await userCodeHistory(serviceSupabase(), user)).blockedInvite).toMatchObject({ status: 'blocked_same_ip', retries: false })
})

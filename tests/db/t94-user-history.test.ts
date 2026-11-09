import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { PAGE_SIZE } from '@/core/admin/cursor'
import { userCodeHistory } from '@/core/admin/users/code-history'
import { site } from '@/site/site.config'

import { connectAdmin, createUser } from './helpers'
import { serviceSupabase } from './supabase-env'

let db: Client
beforeAll(async () => { db = await connectAdmin() })
afterAll(async () => { await db.end() })

it('shows only successful redemptions for this account and pages campaigns without duplicates', async () => {
  const user = await createUser(db)
  const inviter = await createUser(db)
  const inviteCode = randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()
  const { rows: [invite] } = await db.query("insert into codes (code,kind,owner_user_id) values ($1,'invite',$2) returning id", [inviteCode, inviter])
  await db.query("insert into code_redemptions(code_id,user_id,inviter_user_id,kind,context,status) values ($1,$2,$3,'invite','account','ok')", [invite.id, user, inviter])
  await db.query(`with offers as (
    insert into codes(code,kind,invitee_credits,invitee_pool)
    select upper(substr(md5(gen_random_uuid()::text),1,12)), 'campaign', $3, 'free' from generate_series(1,$1)
    returning id
  ) insert into code_redemptions(code_id,user_id,kind,context,status)
    select id,$2,'campaign','account','ok' from offers`, [PAGE_SIZE + 1, user, site.growth.invite.inviteeCredits])
  const admin = serviceSupabase()
  const first = await userCodeHistory(admin, user)
  expect(first).toMatchObject({ inviterId: inviter, inviteCode, paged: false })
  expect(first.campaigns.items).toHaveLength(PAGE_SIZE)
  expect(first.campaigns.nextCursor).toEqual(expect.any(String))
  const next = await userCodeHistory(admin, user, first.campaigns.nextCursor)
  expect(next.campaigns.items).toHaveLength(1)
  expect(next.campaigns.nextCursor).toBeNull()
  expect(first.campaigns.items).not.toContainEqual(next.campaigns.items[0])
  const other = await userCodeHistory(admin, inviter)
  expect(other).toMatchObject({ inviterId: null, inviteCode: null, campaigns: { items: [] } })
})

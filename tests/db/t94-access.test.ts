import type { Client } from 'pg'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { connectAdmin, createUser } from './helpers'

let db: Client
beforeAll(async () => { db = await connectAdmin() })
afterAll(async () => { await db.end() })

it('keeps both tables private and all code writes behind service RPCs', async () => {
  const { rows } = await db.query(`
    select relname, relrowsecurity,
      has_table_privilege('anon', oid, 'SELECT') as anon,
      has_table_privilege('authenticated', oid, 'SELECT') as authenticated,
      has_table_privilege('service_role', oid, 'INSERT,UPDATE,DELETE') as direct_write
    from pg_class where oid in ('public.codes'::regclass, 'public.code_redemptions'::regclass)
  `)
  expect(rows).toHaveLength(2)
  for (const row of rows) {
    expect(row).toMatchObject({ relrowsecurity: true, anon: false, authenticated: false, direct_write: false })
  }
})

it('preserves the single-invite limit after the inviter deletes their account', async () => {
  const owner = await createUser(db)
  const user = await createUser(db)
  const { rows: [invite] } = await db.query('select public.get_or_create_invite_code($1) as code', [owner])
  await db.query(`insert into public.code_redemptions(code_id, user_id, inviter_user_id, kind, context, status)
    select id, $1, $2, 'invite', 'signup', 'ok' from public.codes where code = $3`, [user, owner, invite.code])
  await db.query('delete from auth.users where id = $1', [owner])
  const { rows } = await db.query('select code_id, inviter_user_id from public.code_redemptions where user_id = $1', [user])
  expect(rows).toEqual([{ code_id: null, inviter_user_id: null }])
})

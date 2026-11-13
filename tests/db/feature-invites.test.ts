import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { listFeatureSettings, setFeatureInvite } from '@/core/admin'
import { featureAllowed, isInvited } from '@/core/features'

import { connectAdmin, createUser, serviceClient } from './helpers'
import { serviceSupabase } from './supabase-env'

// Invite-only features (1342 / 1343): admin_set_feature_grant through the admin command, the list
// the admin page shows, and the gate requireFeature applies. Keys are unique per run.

let db: Client
let admin: string
const service = serviceSupabase()
const key = () => `inv_${randomUUID().replaceAll('-', '').slice(0, 12)}`
const now = () => Date.parse('2026-11-13T00:00:00Z')

beforeAll(async () => {
  db = await connectAdmin()
  admin = await createUser(db)
  await db.query("update public.profiles set role = 'admin' where id = $1", [admin])
})

afterAll(async () => {
  await db.query(`delete from public.feature_user_grants where feature_key like 'inv_%'`)
  await db.end()
})

const emailOf = async (id: string) => (await db.query('select email from auth.users where id = $1', [id])).rows[0].email as string
const gate = (k: string) => ({
  registry: [{ key: k, name: '内测', inviteOnly: true }], loadAccess: async () => [], now, invited: (id: string, key: string) => isInvited(service, id, key),
})

describe('invite-only features', () => {
  it('invites by email, lists the account, opens the gate, and removes by id', async () => {
    const k = key()
    const registry = [{ key: k, name: '内测', inviteOnly: true }]
    const friend = await createUser(db)
    expect(await featureAllowed(friend, k, gate(k))).toBe(false)

    await setFeatureInvite({ db: service, registry }, admin, { key: k, account: (await emailOf(friend)).toUpperCase(), invited: true })
    const [listed] = await listFeatureSettings(service, registry)
    expect(listed?.invites).toEqual([expect.objectContaining({ userId: friend, account: await emailOf(friend) })])
    expect(await featureAllowed(friend, k, gate(k))).toBe(true)
    expect((await db.query('select granted_by from public.feature_user_grants where feature_key = $1', [k])).rows[0].granted_by).toBe(admin)

    await setFeatureInvite({ db: service, registry }, admin, { key: k, account: friend, invited: false })
    expect(await featureAllowed(friend, k, gate(k))).toBe(false)
  })

  it('finds a phone-only account by its number with or without the country code', async () => {
    const k = key()
    const registry = [{ key: k, name: '内测', inviteOnly: true }]
    const phoneUser = randomUUID()
    const digits = `139${String(Date.now()).slice(-8)}`
    await db.query("insert into auth.users (id, phone, aud, role) values ($1, $2, 'authenticated', 'authenticated')", [phoneUser, `86${digits}`])
    await setFeatureInvite({ db: service, registry }, admin, { key: k, account: digits, invited: true })
    const [listed] = await listFeatureSettings(service, registry)
    expect(listed?.invites[0]).toMatchObject({ userId: phoneUser, account: `+86${digits}` })
  })

  it('is open to an admin and closed to a banned invited account', async () => {
    const k = key()
    expect(await featureAllowed(admin, k, gate(k))).toBe(true)
    const banned = await createUser(db)
    await db.query('insert into public.feature_user_grants (feature_key, user_id) values ($1, $2)', [k, banned])
    await db.query('update public.profiles set banned_at = now() where id = $1', [banned])
    expect(await featureAllowed(banned, k, gate(k))).toBe(false)
  })

  it('refuses a non-admin actor and an unknown account; clients cannot read the table', async () => {
    const k = key()
    const user = await createUser(db)
    const args = { p_actor: user, p_key: k, p_account: await emailOf(user), p_granted: true }
    expect((await serviceClient().rpc('admin_set_feature_grant', args)).error?.message).toBe('NOT_ADMIN')
    const unknown = { ...args, p_actor: admin, p_account: 'nobody@example.test' }
    expect((await serviceClient().rpc('admin_set_feature_grant', unknown)).error?.message).toBe('PROFILE_NOT_FOUND')
    const asUser = await db.query("select has_table_privilege('authenticated', 'public.feature_user_grants', 'select') as ok")
    expect(asUser.rows[0].ok).toBe(false)
  })
})

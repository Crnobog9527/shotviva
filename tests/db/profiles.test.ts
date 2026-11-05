import { randomUUID } from 'node:crypto'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ANON_KEY, API_URL, DB_URL, SERVICE_ROLE_KEY } from './supabase-env'

// Real local Supabase (Auth + PostgREST + Postgres), never a mock (AGENTS §7).
const options = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(API_URL, SERVICE_ROLE_KEY, options)
const db = new Client({ connectionString: DB_URL })
const PASSWORD = `pw-${randomUUID()}`

async function createUser(confirmed: boolean) {
  const email = `t1-${randomUUID()}@example.test`
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: confirmed })
  if (error || !data.user) throw error ?? new Error('createUser returned no user')
  return { id: data.user.id, email }
}

async function signedInClient(email: string): Promise<SupabaseClient> {
  const client = createClient(API_URL, ANON_KEY, options)
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw error
  return client
}

async function profileRow(id: string) {
  const { rows } = await db.query('select role, credits, paid_until, signup_ip, banned_at from public.profiles where id = $1', [id])
  return rows[0] ?? null
}

describe('profiles (0001)', () => {
  beforeAll(async () => {
    await db.connect()
  })

  afterAll(async () => {
    await db.end()
  })

  it('creates a profile row with safe defaults when an auth user is created', async () => {
    const user = await createUser(false)
    expect(await profileRow(user.id)).toEqual({ role: 'user', credits: 0, paid_until: null, signup_ip: null, banned_at: null })
  })

  it('refuses password sign-in until the email is confirmed', async () => {
    const user = await createUser(false)
    const client = createClient(API_URL, ANON_KEY, options)
    const { error } = await client.auth.signInWithPassword({ email: user.email, password: PASSWORD })
    expect(error?.code).toBe('email_not_confirmed')
  })

  it('lets a user read only their own row', async () => {
    const [me, other] = [await createUser(true), await createUser(true)]
    const client = await signedInClient(me.email)
    const { data } = await client.from('profiles').select('id, role, credits')
    expect(data).toEqual([{ id: me.id, role: 'user', credits: 0 }])
    const { data: theirs } = await client.from('profiles').select('id').eq('id', other.id)
    expect(theirs).toEqual([])
  })

  it('blocks client writes to role, credits and paid_until', async () => {
    const me = await createUser(true)
    const client = await signedInClient(me.email)
    const update = await client.from('profiles').update({ role: 'admin', credits: 999 }).eq('id', me.id)
    expect(update.error?.code).toBe('42501')
    const insert = await client.from('profiles').insert({ id: randomUUID() })
    expect(insert.error?.code).toBe('42501')
    const remove = await client.from('profiles').delete().eq('id', me.id)
    expect(remove.error?.code).toBe('42501')
    expect(await profileRow(me.id)).toMatchObject({ role: 'user', credits: 0 })
  })

  it('removes the profile when the auth user is deleted (account deletion)', async () => {
    const me = await createUser(true)
    const { error } = await admin.auth.admin.deleteUser(me.id)
    expect(error).toBeNull()
    expect(await profileRow(me.id)).toBeNull()
  })

  it('lets the service role record signup_ip once', async () => {
    const me = await createUser(true)
    await admin.from('profiles').update({ signup_ip: '203.0.113.7' }).eq('id', me.id).is('signup_ip', null)
    await admin.from('profiles').update({ signup_ip: '198.51.100.1' }).eq('id', me.id).is('signup_ip', null)
    expect((await profileRow(me.id))?.signup_ip).toBe('203.0.113.7')
  })
})

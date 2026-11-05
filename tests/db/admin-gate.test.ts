import { randomUUID } from 'node:crypto'

import { createServerClient } from '@supabase/ssr'
import { NextRequest } from 'next/server'
import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { connectAdmin, localSupabase, retryAuth } from './helpers'
import { serviceSupabase } from './supabase-env'

// T23: every /admin/* route is a 404 for anyone but a verified admin, checked with real
// sessions signed in against local Supabase Auth and sent through the proxy as cookies.

type Gate = (request: NextRequest) => Promise<Response>
let proxyGate: Gate
let adminPaths: string[]
let db: Client
const cookies: Record<'user' | 'admin', string> = { user: '', admin: '' }

async function signedInCookie(role: 'user' | 'admin'): Promise<string> {
  const email = `t23-${role}-${randomUUID()}@example.test`
  const password = `pw-${randomUUID()}`
  const user = await retryAuth(async () => {
    const { data, error } = await serviceSupabase().auth.admin.createUser({ email, password, email_confirm: true })
    if (error || !data.user) throw error ?? new Error('createUser failed')
    return data.user
  })
  if (role === 'admin') await db.query("update public.profiles set role = 'admin' where id = $1", [user.id])
  // @supabase/ssr writes the session the same way the app's login does.
  let jar: { name: string; value: string }[] = []
  const { apiUrl, anonKey } = localSupabase()
  const client = createServerClient(apiUrl, anonKey, {
    cookies: {
      getAll: () => jar,
      setAll: (set) => {
        jar = set.map(({ name, value }) => ({ name, value }))
      },
    },
  })
  await retryAuth(async () => {
    const signIn = await client.auth.signInWithPassword({ email, password })
    if (signIn.error) throw signIn.error
  })
  return jar.map(({ name, value }) => `${name}=${value}`).join('; ')
}

// Module imports plus two GoTrue sign-ins: slower than the default hook budget on a busy machine.
beforeAll(async () => {
  db = await connectAdmin()
  // publicEnv is read at import, so point it at the local stack first.
  const { apiUrl, anonKey } = localSupabase()
  process.env.NEXT_PUBLIC_SUPABASE_URL = apiUrl
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anonKey
  proxyGate = (await import('@/core/auth')).proxyGate
  const { adminNavItems } = await import('@/core/admin')
  const nav = adminNavItems({ wishlist: true }).map((item) => item.href)
  adminPaths = [...nav, `/admin/users/${randomUUID()}`, '/admin/jobs?status=failed', '/admin/announcements?cursor=x', '/admin/']
  cookies.user = await signedInCookie('user')
  cookies.admin = await signedInCookie('admin')
}, 120_000)

afterAll(async () => {
  await db?.end()
})

const visit = (path: string, cookie?: string) =>
  proxyGate(new NextRequest(`http://localhost:3000${path}`, { headers: cookie ? { cookie } : {} }))

describe('admin gate with real sessions', () => {
  it('answers 404 (noindex) on every admin path for a visitor and a signed-in non-admin', async () => {
    for (const path of adminPaths) {
      for (const cookie of [undefined, cookies.user]) {
        const response = await visit(path, cookie)
        expect(response.status, `${path} ${cookie ? 'user' : 'anon'}`).toBe(404)
        expect(response.headers.get('x-robots-tag')).toMatch(/noindex/)
      }
    }
  })

  it('lets the admin through on the same paths', async () => {
    for (const path of adminPaths) {
      const response = await visit(path, cookies.admin)
      expect(response.status, path).toBe(200)
    }
  })
})

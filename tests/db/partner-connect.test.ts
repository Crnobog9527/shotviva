import { NextRequest } from 'next/server'
import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { SessionUser } from '@/core/auth'
import { handleConnectAuthorize, handleLink } from '@/core/partner'

import { connectAdmin } from './helpers'
import { createUser, linkRow, partnerConfig, partnerRequest, routeDeps } from './partner-fixtures'
import { serviceSupabase } from './supabase-env'

// The "Allow" POST on /connect/graylum: same origin, signed in, allowlisted callback → 302
// with a code that /api/partner/link accepts once.

let db: Client

beforeAll(async () => {
  db = await connectAdmin()
})

afterAll(async () => {
  await db.end()
})

// appOrigin with no Vercel env (tests) is the local dev origin.
const APP = 'http://localhost:3000'
const CALLBACK = 'https://auth-staging.graylum.com/api/connectors/shotviva/callback'

function post(fields: Record<string, string>, origin = APP) {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) form.set(key, value)
  return new NextRequest(`${APP}/connect/graylum/authorize`, { method: 'POST', headers: { origin }, body: form })
}

const sessionOf = (id: string, emailVerified = true): SessionUser => ({ id, email: null, role: 'user', emailVerified, banned: false, locale: null })
const deps = (user: SessionUser | null) => ({ db: serviceSupabase, user: async () => user, config: partnerConfig })

describe('connect authorize', () => {
  it('302s to the allowlisted callback with code + state, and the code links once', async () => {
    const userId = await createUser(db, { credits: 3 })
    const response = await handleConnectAuthorize(post({ state: 'graylum-state-1', return_to: CALLBACK }), deps(sessionOf(userId)))
    expect(response.status).toBe(302)
    const location = new URL(response.headers.get('location') ?? '')
    expect(`${location.origin}${location.pathname}`).toBe(CALLBACK)
    expect(location.searchParams.get('state')).toBe('graylum-state-1')

    const code = location.searchParams.get('code') ?? ''
    const link = () => handleLink(partnerRequest('/api/partner/link', { method: 'POST', body: { code } }), routeDeps())
    expect((await link()).status).toBe(200)
    expect((await link()).status).toBe(422)
  })

  it('refuses a non-allowlisted return_to without issuing a code', async () => {
    const userId = await createUser(db)
    const response = await handleConnectAuthorize(
      post({ state: 'graylum-state-2', return_to: 'https://evil.example/api/connectors/shotviva/callback' }),
      deps(sessionOf(userId)),
    )
    expect(response.status).toBe(400)
    expect(response.headers.get('location')).toBeNull()
    expect(await linkRow(db, userId)).toBeNull()
  })

  it('refuses another origin', async () => {
    const userId = await createUser(db)
    const response = await handleConnectAuthorize(post({ state: 'graylum-state-3' }, 'https://evil.example'), deps(sessionOf(userId)))
    expect(response.status).toBe(403)
    expect(await linkRow(db, userId)).toBeNull()
  })

  it('sends a signed-out or unverified user to sign in, back to the same connect page', async () => {
    for (const user of [null, sessionOf(await createUser(db), false)]) {
      const response = await handleConnectAuthorize(post({ state: 'graylum-state-4', return_to: CALLBACK }), deps(user))
      expect(response.status).toBe(303)
      const location = new URL(response.headers.get('location') ?? '')
      expect(location.pathname).toBe('/login')
      expect(location.searchParams.get('next')).toBe(
        `/connect/graylum?state=graylum-state-4&return_to=${encodeURIComponent(CALLBACK)}`,
      )
    }
  })
})

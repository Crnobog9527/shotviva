import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ServerEnv } from '../env'

const mocks = vi.hoisted(() => ({ env: {} as Partial<ServerEnv> }))
vi.mock('../env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../env')>()
  return { ...actual, serverEnv: () => ({ ...actual.serverEnv(), ...mocks.env }) }
})

const { assertSameOrigin } = await import('./api-guards')

// appOrigin is the test default, http://localhost:3000, standing in for the branch URL.
const ALIAS = 'shotviva-qa-user.vercel.app'

function post(host: string, origin: string | null) {
  const headers: Record<string, string> = { host }
  if (origin) headers.origin = origin
  return new NextRequest(`https://${host}/api/uploads`, { method: 'POST', headers })
}

beforeEach(() => {
  mocks.env = { VERCEL_ENV: 'preview', PREVIEW_EXTRA_HOSTS: [ALIAS] }
})

describe('assertSameOrigin', () => {
  it('accepts appOrigin, as before', () => {
    expect(() => assertSameOrigin(post('localhost:3000', 'http://localhost:3000'))).not.toThrow()
  })

  it('accepts an allow-listed alias calling itself on a preview', () => {
    expect(() => assertSameOrigin(post(ALIAS, `https://${ALIAS}`))).not.toThrow()
  })

  it('refuses a cross-origin call, a missing Origin and an unlisted host claiming itself', () => {
    expect(() => assertSameOrigin(post(ALIAS, 'https://evil.example'))).toThrow('Bad origin')
    expect(() => assertSameOrigin(post(ALIAS, 'http://localhost:3000'))).toThrow('Bad origin')
    expect(() => assertSameOrigin(post(ALIAS, null))).toThrow('Bad origin')
    expect(() => assertSameOrigin(post('evil.example', 'https://evil.example'))).toThrow('Bad origin')
  })

  it('accepts only appOrigin in production', () => {
    mocks.env = { VERCEL_ENV: 'production', PREVIEW_EXTRA_HOSTS: [ALIAS] }
    expect(() => assertSameOrigin(post(ALIAS, `https://${ALIAS}`))).toThrow('Bad origin')
    expect(() => assertSameOrigin(post(ALIAS, 'http://localhost:3000'))).not.toThrow()
  })
})

import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { benefits } from '../../../../tests/t94-config'
import type { ServerEnv } from '../../env'

// The landing goes back to the host the link was opened on, where the session cookie was
// just set, when that host is an allow-listed test-site alias (core/request-origin). Here
// appOrigin is the test default, http://localhost:3000, standing in for the branch URL.

const mocks = vi.hoisted(() => ({
  env: { VERCEL_ENV: 'preview', PREVIEW_EXTRA_HOSTS: ['shotviva-qa-admin.vercel.app'] } as Partial<ServerEnv>,
  verifyOtp: vi.fn(),
  getUser: vi.fn(),
}))

vi.mock('../../env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../env')>()
  return { ...actual, serverEnv: () => ({ ...actual.serverEnv(), ...mocks.env }) }
})
vi.mock('@supabase/ssr', () => ({
  createServerClient: (_url: string, _key: string, options: { cookies: { setAll: (c: object[]) => void } }) => ({
    auth: {
      verifyOtp: async (...args: unknown[]) => {
        options.cookies.setAll([{ name: 'sb-access-token', value: 'session', options: { path: '/' } }])
        return mocks.verifyOtp(...args)
      },
      getUser: mocks.getUser,
    },
  }),
}))
vi.mock('../../affiliate/feature', () => ({ isAffiliateEnabled: vi.fn() }))
vi.mock('../first-sign-in', () => ({ onVerifiedSignIn: vi.fn() }))

const { handleAuthConfirm } = await import('./confirm')

const TOKEN = 'pkce_0123456789abcdef0123456789abcdef'
const VERIFIED = { id: 'u1', email_confirmed_at: '2026-11-05T00:00:00Z', app_metadata: { provider: 'email' } }
const QUERY = `token_hash=${TOKEN}&type=magiclink&next=%2Fadmin%2Ftemplates`

function openLink(host: string) {
  return handleAuthConfirm(new NextRequest(`https://${host}/auth/confirm?${QUERY}`, { headers: { host } }), benefits)
}

beforeEach(() => {
  mocks.env = { VERCEL_ENV: 'preview', PREVIEW_EXTRA_HOSTS: ['shotviva-qa-admin.vercel.app'] }
  mocks.verifyOtp.mockResolvedValue({ data: { user: VERIFIED }, error: null })
  mocks.getUser.mockResolvedValue({ data: { user: VERIFIED } })
})

describe('/auth/confirm landing host', () => {
  it('signs in on an allow-listed alias and stays on it', async () => {
    const response = await openLink('shotviva-qa-admin.vercel.app')
    expect(response.headers.get('location')).toBe('https://shotviva-qa-admin.vercel.app/admin/templates')
    expect(response.headers.get('set-cookie')).toContain('sb-access-token=session')
  })

  it('sends an unknown host to appOrigin, never to the Host header', async () => {
    const response = await openLink('evil.example')
    expect(response.headers.get('location')).toBe('http://localhost:3000/admin/templates')
  })

  it('ignores the allow-list in production', async () => {
    mocks.env = { VERCEL_ENV: 'production', PREVIEW_EXTRA_HOSTS: ['shotviva-qa-admin.vercel.app'] }
    const response = await openLink('shotviva-qa-admin.vercel.app')
    expect(response.headers.get('location')).toBe('http://localhost:3000/admin/templates')
  })

  it('keeps a failed link on the alias too, so the login page there explains it', async () => {
    mocks.verifyOtp.mockResolvedValue({ data: {}, error: { code: 'otp_expired', status: 403 } })
    const response = await openLink('shotviva-qa-admin.vercel.app')
    expect(response.headers.get('location')).toBe(
      'https://shotviva-qa-admin.vercel.app/login?error=link_expired&next=%2Fadmin%2Ftemplates',
    )
  })
})

import { describe, expect, it } from 'vitest'

import { resolveAppOrigin } from './site-url'

describe('resolveAppOrigin', () => {
  it('prefers an explicit NEXT_PUBLIC_SITE_URL and keeps only its origin', () => {
    expect(
      resolveAppOrigin({ NEXT_PUBLIC_SITE_URL: 'https://shotviva.com/x', NEXT_PUBLIC_VERCEL_ENV: 'preview', NEXT_PUBLIC_VERCEL_BRANCH_URL: 'b.vercel.app' }),
    ).toBe('https://shotviva.com')
  })

  it('uses the branch URL on a Vercel preview', () => {
    expect(
      resolveAppOrigin({
        NEXT_PUBLIC_VERCEL_ENV: 'preview',
        NEXT_PUBLIC_VERCEL_BRANCH_URL: 'shotviva-git-feat-auth-simons-projects-bfe3e99f.vercel.app',
        NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL: 'shotviva.com',
      }),
    ).toBe('https://shotviva-git-feat-auth-simons-projects-bfe3e99f.vercel.app')
  })

  it('uses the production URL on Vercel production', () => {
    expect(
      resolveAppOrigin({ NEXT_PUBLIC_VERCEL_ENV: 'production', NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL: 'shotviva.com' }),
    ).toBe('https://shotviva.com')
  })

  it('falls back to localhost off Vercel or when the host is missing', () => {
    expect(resolveAppOrigin({})).toBe('http://localhost:3000')
    expect(resolveAppOrigin({ NEXT_PUBLIC_VERCEL_ENV: 'development' })).toBe('http://localhost:3000')
    expect(resolveAppOrigin({ NEXT_PUBLIC_VERCEL_ENV: 'preview' })).toBe('http://localhost:3000')
  })
})

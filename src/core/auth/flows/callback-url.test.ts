import { describe, expect, it } from 'vitest'

import { resolveAppOrigin } from '../../site-url'
import { confirmUrl } from './callback-url'

const PREVIEW = resolveAppOrigin({
  NEXT_PUBLIC_VERCEL_ENV: 'preview',
  NEXT_PUBLIC_VERCEL_BRANCH_URL: 'shotviva-git-fix-auth-email-links-simons-projects-bfe3e99f.vercel.app',
  NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL: 'shotviva.com',
})
const PRODUCTION = resolveAppOrigin({ NEXT_PUBLIC_VERCEL_ENV: 'production', NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL: 'shotviva.com' })
const LOCAL = resolveAppOrigin({})

describe('confirmUrl', () => {
  it('points auth emails at the preview branch origin on a preview deployment', () => {
    expect(confirmUrl('/account', PREVIEW)).toBe(
      'https://shotviva-git-fix-auth-email-links-simons-projects-bfe3e99f.vercel.app/auth/confirm?next=%2Faccount',
    )
  })

  it('points auth emails at shotviva.com in production and localhost locally', () => {
    expect(confirmUrl('/reset/update', PRODUCTION)).toBe('https://shotviva.com/auth/confirm?next=%2Freset%2Fupdate')
    expect(confirmUrl('/account', LOCAL)).toBe('http://localhost:3000/auth/confirm?next=%2Faccount')
  })

  it('always carries a query string, so templates can append &token_hash=', () => {
    for (const next of ['/account', '', '//evil.example', 'https://evil.example/']) {
      const url = new URL(confirmUrl(next, PRODUCTION))
      expect(url.origin).toBe('https://shotviva.com')
      expect(url.search.startsWith('?next=')).toBe(true)
    }
    expect(confirmUrl('//evil.example', PRODUCTION)).toBe('https://shotviva.com/auth/confirm?next=%2Faccount')
  })
})

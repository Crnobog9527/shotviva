import { describe, expect, it } from 'vitest'

import { shellPrivacyProblems } from './app-shell-private-lib'

describe('the app shell carries nothing of an account (ARCHITECTURE §18.3)', () => {
  it('passes the public frame: placeholders, the public catalogue file, the site’s own address', () => {
    expect(shellPrivacyProblems('<input placeholder="you@company.com"> fetch("/api/catalogue/public/zh/current") /api/version support@shotviva.com', 'shotviva.com')).toEqual([])
  })

  it('flags an email, a signed-in API, an id, the real balance chip, the Admin item and session material', () => {
    const problems = shellPrivacyProblems('qa-admin@gmail.com /api/account /api/generate/status 2f1c9a4e-1b2c-4d3e-8f90-123456789abc <span data-coin=""> data-admin-entry sb-abc-auth-token refresh_token', 'shotviva.com')
    expect(problems).toHaveLength(8)
  })
})

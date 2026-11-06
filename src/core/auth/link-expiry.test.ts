import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { EMAIL_LINK_HOURS, EMAIL_LINK_SECONDS } from './link-expiry'

// The reset pages say how long a link works; that has to be what Supabase actually allows.
describe('EMAIL_LINK_SECONDS', () => {
  it('matches otp_expiry in supabase/config.toml', () => {
    const config = readFileSync(join(process.cwd(), 'supabase', 'config.toml'), 'utf8')
    expect(config.match(/^otp_expiry = (\d+)$/m)?.[1]).toBe(String(EMAIL_LINK_SECONDS))
    expect(EMAIL_LINK_HOURS).toBe(1)
  })
})

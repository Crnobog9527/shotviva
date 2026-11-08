import { describe, expect, it } from 'vitest'

import { privacyCollectSections } from './privacy-collect'
import { privacyShareSections } from './privacy-share'

// hCaptcha runs on sign-up, sign-in and password reset (ARCHITECTURE §7), and on the business
// inquiry form (T86); the Privacy Policy's provider list says so and names the data it processes
// (Owner 2026-11-07).
describe('Privacy Policy: hCaptcha', () => {
  it('lists hCaptcha with all three forms and the data it processes', () => {
    const share = JSON.stringify(privacyShareSections)
    expect(share).toContain('hCaptcha: bot protection on sign-up, sign-in, password reset and the business inquiry form.')
    expect(share).toContain('device and interaction data under hCaptcha’s own privacy policy')
    expect(JSON.stringify(privacyCollectSections)).toContain('(hCaptcha) when you sign up, sign in or reset your password, and when you send a business inquiry')
  })

  it('says what the business inquiry form collects, that it is used only to reply, and that no plain IP is kept (T86)', () => {
    const collect = JSON.stringify(privacyCollectSections)
    expect(collect).toContain('We use these contact details only to reply to that inquiry.')
    expect(collect).toContain('never the address itself')
  })
})

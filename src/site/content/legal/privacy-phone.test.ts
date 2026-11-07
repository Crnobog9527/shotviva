import { describe, expect, it } from 'vitest'

import { privacyPage } from './privacy'

// T63: the Privacy Policy has the phone section the sign-in consent box links to
// (/privacy#phone-numbers), with purpose, the SMS processor and the cross-border transfer.
describe('Privacy Policy: phone numbers', () => {
  const text = JSON.stringify(privacyPage)

  it('has the section the consent box links to', () => {
    expect(privacyPage.sections.map((section) => section.id)).toContain('phone-numbers')
  })

  it('names the purpose, the SMS provider, the limits record and the transfer outside mainland China', () => {
    expect(text).toContain('mainland China (+86) mobile number')
    expect(text).toContain('An SMS service provider: delivers sign-in codes')
    expect(text).toContain('one-way hash of the phone number')
    expect(text).toContain('outside mainland China')
    expect(text).toContain('in a separate box')
  })
})

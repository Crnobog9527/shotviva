import { describe, expect, it } from 'vitest'

import { CONSENT_COUNTRIES, needsConsent } from './region'

describe('needsConsent (ARCHITECTURE §16.1, T70)', () => {
  it('asks the EU, the rest of the EEA, the UK and Switzerland', () => {
    for (const country of ['DE', 'FR', 'IE', 'NL', 'PL', 'SE', 'IS', 'LI', 'NO', 'GB', 'CH']) expect(needsConsent(country)).toBe(true)
    expect(CONSENT_COUNTRIES.size).toBe(27 + 3 + 2)
  })

  it('does not ask anyone else', () => {
    for (const country of ['US', 'CN', 'CA', 'BR', 'JP', 'AU', 'IN', 'TR', 'RU', 'UA']) expect(needsConsent(country)).toBe(false)
  })

  it('asks when the country is unknown or malformed', () => {
    for (const country of [null, undefined, '', ' ', 'XX', 'USA', '1']) expect(needsConsent(country)).toBe(true)
  })

  it('reads lower case and stray spaces', () => {
    expect(needsConsent('de')).toBe(true)
    expect(needsConsent(' us ')).toBe(false)
  })
})

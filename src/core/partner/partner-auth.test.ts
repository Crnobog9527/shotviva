import { describe, expect, it } from 'vitest'

import { assertPartnerKey, configuredPartnerKey } from './partner-auth'
import { PartnerError } from './partner-error'

const LIVE = `sv_live_${'a'.repeat(40)}`
const TEST = `sv_test_${'b'.repeat(40)}`

const production = { GRAYLUM_PARTNER_KEY: LIVE, VERCEL_ENV: 'production' as const }
const preview = { GRAYLUM_PARTNER_KEY: TEST, VERCEL_ENV: 'preview' as const }

function codeOf(run: () => void): string | null {
  try {
    run()
    return null
  } catch (error) {
    return error instanceof PartnerError ? error.code : 'other'
  }
}

describe('assertPartnerKey', () => {
  it('accepts the environment’s own key', () => {
    expect(codeOf(() => assertPartnerKey(`Bearer ${LIVE}`, production))).toBeNull()
    expect(codeOf(() => assertPartnerKey(`Bearer ${TEST}`, preview))).toBeNull()
  })

  it.each([
    ['no header', null],
    ['wrong key', `Bearer sv_live_${'c'.repeat(40)}`],
    ['the preview key', `Bearer ${TEST}`],
    ['no Bearer scheme', LIVE],
    ['empty bearer', 'Bearer '],
  ])('401s %s in production', (_, header) => {
    expect(codeOf(() => assertPartnerKey(header, production))).toBe('unauthorized')
  })

  it('401s the production key on a preview', () => {
    expect(codeOf(() => assertPartnerKey(`Bearer ${LIVE}`, preview))).toBe('unauthorized')
  })

  it('refuses everything when the key is unset', () => {
    expect(codeOf(() => assertPartnerKey('Bearer anything', { GRAYLUM_PARTNER_KEY: undefined, VERCEL_ENV: 'production' }))).toBe('unauthorized')
  })
})

describe('configuredPartnerKey', () => {
  it('ignores a key of the wrong kind or too short, so a preview key pasted into production cannot work', () => {
    expect(configuredPartnerKey({ GRAYLUM_PARTNER_KEY: TEST, VERCEL_ENV: 'production' })).toBeNull()
    expect(configuredPartnerKey({ GRAYLUM_PARTNER_KEY: LIVE, VERCEL_ENV: undefined })).toBeNull()
    expect(configuredPartnerKey({ GRAYLUM_PARTNER_KEY: 'sv_live_short', VERCEL_ENV: 'production' })).toBeNull()
    expect(configuredPartnerKey({ GRAYLUM_PARTNER_KEY: TEST, VERCEL_ENV: 'development' })).toBe(TEST)
  })
})

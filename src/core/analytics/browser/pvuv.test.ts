import { describe, expect, it } from 'vitest'

import { clearPvuvStorage, PVUV_EXCLUDE, pvuvAttributes } from './pvuv'

describe('pvuvAttributes', () => {
  it('points the tracking tag at PVUV with the site and the exclusions', () => {
    const attrs = pvuvAttributes('site_1')
    expect(attrs).toMatchObject({ src: 'https://www.pvuv.ai/f.js', 'data-api': 'https://in.pvuv.ai', 'data-site': 'site_1', 'data-sensors': 'off' })
    expect(attrs['data-exclude']).toBe(PVUV_EXCLUDE)
  })
})

describe('PVUV_EXCLUDE', () => {
  // PVUV's own matcher: comma-separated globs, `*` = anything, whole-path match.
  const globs = PVUV_EXCLUDE.split(',').map((glob) => new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`))
  const excluded = (path: string) => globs.some((re) => re.test(path))

  it.each(['/admin', '/admin/analytics', '/zh/admin/users', '/account', '/account/billing', '/zh/account', '/checkout/return', '/generate/abc', '/photos', '/posters/1', '/wishlist', '/reset/update', '/join/org/secret-token', '/connect/graylum'])(
    'leaves out %s',
    (path) => expect(excluded(path)).toBe(true),
  )

  it.each(['/', '/pricing', '/zh', '/zh/pricing', '/login', '/signup', '/blog/best-ai-food-photography-tools', '/gallery', '/accounting-tips'])('measures %s', (path) =>
    expect(excluded(path)).toBe(false),
  )
})

describe('clearPvuvStorage', () => {
  it('removes _pv cookies and storage keys, and only those', () => {
    const written: string[] = []
    const doc = {
      cookie: '_pv_id=abc; sv_analytics_consent=accepted; _pv_sid=1',
      location: { hostname: 'www.shotviva.com' },
    }
    Object.defineProperty(doc, 'cookie', { get: () => '_pv_id=abc; sv_analytics_consent=accepted; _pv_sid=1', set: (value: string) => void written.push(value) })
    const store: Record<string, string> = { _pv_v: 'x', sv_analytics_consent: 'accepted' }
    const storage = { removeItem: (key: string) => delete store[key] } as unknown as Storage
    Object.assign(storage, store)
    clearPvuvStorage(doc as unknown as Document, [storage])
    expect(written.some((c) => c.startsWith('_pv_id=;'))).toBe(true)
    expect(written.some((c) => c.startsWith('_pv_sid=;') && c.includes('Domain=shotviva.com'))).toBe(true)
    expect(written.some((c) => c.startsWith('sv_analytics_consent'))).toBe(false)
    expect('_pv_v' in store).toBe(false)
    expect(store.sv_analytics_consent).toBe('accepted')
  })
})

import { describe, expect, it } from 'vitest'

import { isAllowedLink, isBannerHiddenPath, isLive, localize, pickLive } from './rules'
import type { AnnouncementRow } from './types'

const row: AnnouncementRow = {
  id: 'a1',
  message_en: 'Black Friday: 30% off packs',
  message_zh: '黑五：积分包七折',
  link_url: '/pricing',
  link_label_en: 'See pricing',
  link_label_zh: '看价格',
  tone: 'promo',
  starts_at: '2026-11-27T00:00:00Z',
  ends_at: '2026-12-01T00:00:00Z',
}

const at = (iso: string) => Date.parse(iso)

describe('announcement rules', () => {
  it('accepts site paths and https only', () => {
    expect(isAllowedLink('/pricing')).toBe(true)
    expect(isAllowedLink('https://shotviva.com/x')).toBe(true)
    expect(isAllowedLink('//evil.example')).toBe(false)
    expect(isAllowedLink('http://shotviva.com')).toBe(false)
    expect(isAllowedLink('javascript:alert(1)')).toBe(false)
    expect(isAllowedLink('/a b')).toBe(false)
    expect(isAllowedLink('https://user@evil.example')).toBe(false)
  })

  it('is live from starts_at (inclusive) to ends_at (exclusive); null bounds are open', () => {
    const banner = localize(row, 'en')
    expect(isLive(banner, at('2026-11-26T23:59:59Z'))).toBe(false)
    expect(isLive(banner, at('2026-11-27T00:00:00Z'))).toBe(true)
    expect(isLive(banner, at('2026-12-01T00:00:00Z'))).toBe(false)
    expect(isLive({ startsAt: null, endsAt: null }, 0)).toBe(true)
  })

  it('picks the live one among scheduled candidates', () => {
    const later = { ...localize(row, 'en'), id: 'later', startsAt: '2026-12-10T00:00:00Z', endsAt: null }
    const items = [localize(row, 'en'), later]
    expect(pickLive(items, at('2026-11-28T00:00:00Z'))?.id).toBe('a1')
    expect(pickLive(items, at('2026-12-05T00:00:00Z'))).toBeNull()
    expect(pickLive(items, at('2026-12-11T00:00:00Z'))?.id).toBe('later')
  })

  it('shows the visitor language from the table columns', () => {
    expect(localize(row, 'zh')).toMatchObject({ message: '黑五：积分包七折', link: { url: '/pricing', label: '看价格' } })
    expect(localize(row, 'en')).toMatchObject({ message: 'Black Friday: 30% off packs', link: { label: 'See pricing' } })
    expect(localize({ ...row, link_url: null }, 'en').link).toBeNull()
  })

  it('hides on admin and checkout, with or without /zh', () => {
    expect(isBannerHiddenPath('/admin')).toBe(true)
    expect(isBannerHiddenPath('/admin/users')).toBe(true)
    expect(isBannerHiddenPath('/zh/checkout/success')).toBe(true)
    expect(isBannerHiddenPath('/administrator')).toBe(false)
    expect(isBannerHiddenPath('/zh')).toBe(false)
    expect(isBannerHiddenPath('/generate')).toBe(false)
  })
})

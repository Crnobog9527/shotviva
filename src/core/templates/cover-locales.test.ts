import { describe, expect, it } from 'vitest'

import { coverForLocale, coverLocalesSchema, type CoverSource } from './cover-locales'

const common = (extra: Partial<CoverSource> = {}): CoverSource => ({
  coverBeforeUrl: 'https://a/common-before.webp',
  coverAfterUrl: 'https://a/common-after.webp',
  coverMediaType: 'image',
  coverVideoUrl: null,
  coverPosterUrl: null,
  coverLocales: {},
  ...extra,
})

const none = common({ coverBeforeUrl: null, coverAfterUrl: null })

describe('coverForLocale (ARCHITECTURE §8.3 「封面按语言适配」)', () => {
  it('shows the one uploaded cover for every language', () => {
    expect(coverForLocale(common(), 'zh')).toMatchObject({ before: 'https://a/common-before.webp', after: 'https://a/common-after.webp' })
    expect(coverForLocale(common(), 'en').after).toBe('https://a/common-after.webp')
  })

  it('gives a language its own cover only where one was uploaded, keeping the shared "before"', () => {
    const t = common({ coverLocales: { zh: { after: 'https://a/zh-after.webp' } } })
    expect(coverForLocale(t, 'zh')).toMatchObject({ before: 'https://a/common-before.webp', after: 'https://a/zh-after.webp' })
    expect(coverForLocale(t, 'en').after).toBe('https://a/common-after.webp')
  })

  it('without a common cover, shows the first launched language’s cover for every language', () => {
    const t = { ...none, coverLocales: { zh: { before: 'https://a/zh-b.webp', after: 'https://a/zh-a.webp' }, en: { after: 'https://a/en-a.webp' } } }
    expect(coverForLocale(t, 'zh').after).toBe('https://a/zh-a.webp')
    expect(coverForLocale(t, 'en')).toMatchObject({ after: 'https://a/en-a.webp', before: 'https://a/zh-b.webp' })
  })

  it('never shows a language that is not launched yet', () => {
    const t = { ...none, coverLocales: { ja: { before: 'https://a/ja-b.webp', after: 'https://a/ja-a.webp' } } }
    expect(coverForLocale(t, 'en')).toMatchObject({ before: null, after: null })
  })

  it('picks motion the same way, with its own media type and poster', () => {
    const t = common({ coverLocales: { zh: { media: 'video', video: 'https://a/zh.mp4', poster: 'https://a/zh-p.webp' } } })
    expect(coverForLocale(t, 'zh')).toMatchObject({ mediaType: 'video', video: 'https://a/zh.mp4', poster: 'https://a/zh-p.webp' })
    // No common motion cover: the only language that has one shows everywhere.
    expect(coverForLocale(t, 'en')).toMatchObject({ mediaType: 'video', video: 'https://a/zh.mp4' })
    const withCommon = { ...t, coverMediaType: 'animated' as const, coverVideoUrl: 'https://a/c.webp', coverPosterUrl: 'https://a/c-p.webp' }
    expect(coverForLocale(withCommon, 'en')).toMatchObject({ mediaType: 'animated', video: 'https://a/c.webp' })
    expect(coverForLocale(withCommon, 'zh').video).toBe('https://a/zh.mp4')
  })

  it('treats a malformed column as no language covers', () => {
    expect(coverLocalesSchema.parse('nope')).toEqual({})
    expect(coverLocalesSchema.parse({ zh: { after: 3 } })).toEqual({})
  })
})

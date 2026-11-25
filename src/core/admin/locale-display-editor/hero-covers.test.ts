import { describe, expect, it } from 'vitest'

import { heroCoversReady } from './hero-covers'

const t = (before: string | null, after: string | null, coverLocales = {}) => ({ coverBeforeUrl: before, coverAfterUrl: after, coverLocales })

describe('heroCoversReady', () => {
  it('needs both covers', () => {
    expect(heroCoversReady(t('b', 'a'), 'default')).toBe(true)
    expect(heroCoversReady(t('b', null), 'zh')).toBe(false)
    expect(heroCoversReady(t(null, null), 'en')).toBe(false)
  })

  it('counts a language\'s own cover, which every language falls back to when there is no common one', () => {
    expect(heroCoversReady(t('b', null, { zh: { after: 'zh-a' } }), 'zh')).toBe(true)
    expect(heroCoversReady(t('b', null, { zh: { after: 'zh-a' } }), 'default')).toBe(true)
  })
})

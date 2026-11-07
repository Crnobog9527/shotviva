import { describe, expect, it } from 'vitest'

import { chosenLocale, hasChosenLocale, prefersChinese } from './locale-cookie'

describe('language choice and the globe hint (ARCHITECTURE §17)', () => {
  it('counts Chinese anywhere in the browser languages, not only first', () => {
    expect(prefersChinese(['zh-CN', 'en'])).toBe(true)
    expect(prefersChinese(['zh-TW'])).toBe(true)
    expect(prefersChinese(['en-US', 'zh-CN'])).toBe(true)
    expect(prefersChinese(['en-GB', 'de', 'ZH-hk'])).toBe(true)
    expect(prefersChinese(['en-US', 'ja'])).toBe(false)
    expect(prefersChinese([])).toBe(false)
  })

  it('reads a stored choice, either language, and ignores anything else', () => {
    expect(chosenLocale('a=1; NEXT_LOCALE=en')).toBe('en')
    expect(chosenLocale('NEXT_LOCALE=zh; sb-x=1')).toBe('zh')
    expect(chosenLocale('NEXT_LOCALE=fr')).toBeNull()
    expect(chosenLocale('NOT_NEXT_LOCALE=zh')).toBeNull()
    expect(hasChosenLocale('NEXT_LOCALE=zh')).toBe(true)
    expect(hasChosenLocale('sb-x-auth-token=1')).toBe(false)
    expect(hasChosenLocale('')).toBe(false)
  })
})

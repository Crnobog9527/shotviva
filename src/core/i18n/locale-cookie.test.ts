import { describe, expect, it } from 'vitest'

import { hasChosenLocale, prefersChinese } from './locale-cookie'

describe('switch banner conditions (ARCHITECTURE §17)', () => {
  it('only a Chinese first browser language asks for the banner', () => {
    expect(prefersChinese(['zh-CN', 'en'])).toBe(true)
    expect(prefersChinese(['zh-TW'])).toBe(true)
    expect(prefersChinese(['en-US', 'zh-CN'])).toBe(false)
    expect(prefersChinese([])).toBe(false)
  })

  it('a stored choice, either language, silences it', () => {
    expect(hasChosenLocale('a=1; NEXT_LOCALE=en')).toBe(true)
    expect(hasChosenLocale('NEXT_LOCALE=zh')).toBe(true)
    expect(hasChosenLocale('sb-x-auth-token=1')).toBe(false)
    expect(hasChosenLocale('')).toBe(false)
  })
})

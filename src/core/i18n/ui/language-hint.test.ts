import { describe, expect, it } from 'vitest'

import { shouldHint, type HintInput } from './language-hint'

const TWINS = ['/', '/pricing']
const hint = (input: Partial<HintInput>) =>
  shouldHint({ locale: 'en', path: '/pricing', translatedPaths: TWINS, languages: ['en-US', 'zh-CN'], cookie: '', ...input })

// ARCHITECTURE §17 「提醒」 / DESIGN §6.9 item 4.
describe('globe language hint', () => {
  it('shows for a browser with Chinese anywhere in its languages, on an English twin, before a choice', () => {
    expect(hint({})).toBe(true)
    expect(hint({ languages: ['zh-TW'] })).toBe(true)
    expect(hint({ path: '/' })).toBe(true)
  })

  it('stays away after any choice', () => {
    expect(hint({ cookie: 'NEXT_LOCALE=en' })).toBe(false)
    expect(hint({ cookie: 'a=1; NEXT_LOCALE=zh' })).toBe(false)
  })

  it('stays away without Chinese, on Chinese pages and on pages without a twin', () => {
    expect(hint({ languages: ['en-US', 'fr'] })).toBe(false)
    expect(hint({ locale: 'zh' })).toBe(false)
    expect(hint({ path: '/terms' })).toBe(false)
  })
})

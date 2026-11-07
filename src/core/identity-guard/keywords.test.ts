import { describe, expect, it } from 'vitest'

import { ALLOW_EXAMPLES, REFUSE_EXAMPLES } from './examples.test-data'
import { matchIdentitySwapKeyword } from './keywords'

describe('identity swap keywords (ARCHITECTURE §5.1a step one)', () => {
  it('has at least 20 allow and 20 refuse examples, in Chinese and English', () => {
    expect(ALLOW_EXAMPLES.length).toBeGreaterThanOrEqual(20)
    expect(REFUSE_EXAMPLES.length).toBeGreaterThanOrEqual(20)
    for (const list of [ALLOW_EXAMPLES, REFUSE_EXAMPLES]) {
      expect(list.some((e) => e.lang === 'zh')).toBe(true)
      expect(list.some((e) => e.lang === 'en')).toBe(true)
      expect(list.some((e) => e.lang === 'mixed')).toBe(true)
    }
  })

  it.each(REFUSE_EXAMPLES.filter((e) => e.keyword))('catches "$text"', ({ text }) => {
    expect(matchIdentitySwapKeyword(text)).not.toBeNull()
  })

  it.each(ALLOW_EXAMPLES)('lets "$text" through', ({ text }) => {
    expect(matchIdentitySwapKeyword(text)).toBeNull()
  })

  it('ignores case, full-width letters and spaces between Chinese characters', () => {
    expect(matchIdentitySwapKeyword('FACE SWAP please')).not.toBeNull()
    expect(matchIdentitySwapKeyword('ｆａｃｅｓｗａｐ')).not.toBeNull()
    expect(matchIdentitySwapKeyword('帮我 换 脸')).not.toBeNull()
    expect(matchIdentitySwapKeyword('Deep-fake video still')).not.toBeNull()
  })

  it('leaves complexion, avatars, hair and headwear alone', () => {
    for (const text of ['换脸色红润一点', '换个头像风格', '换头发颜色', '换个头盔', '换脸型更瘦一点', 'face the camera', 'swap the shoes for sneakers']) {
      expect(matchIdentitySwapKeyword(text)).toBeNull()
    }
  })
})

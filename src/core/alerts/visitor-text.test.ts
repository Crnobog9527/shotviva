import { describe, expect, it } from 'vitest'

import { visitorText } from './visitor-text'

// Control review of T86: a company name must not ping the Feishu group or carry a link.
describe('visitorText', () => {
  it('drops angle brackets, so <at user_id="all"> cannot ping everyone', () => {
    const text = visitorText('Acme <at user_id="all"></at> Foods', 80)
    expect(text).not.toMatch(/[<>]/)
    expect(text).toBe('Acme at user_id="all"/at Foods')
  })

  it('removes URL schemes and breaks domains so nothing is linked', () => {
    expect(visitorText('Visit https://evil.example/pay now', 80)).toBe('Visit evil．example/pay now')
    expect(visitorText('javascript://x', 80)).not.toContain('://')
    expect(visitorText('shop.tmall.com', 80)).toBe('shop．tmall．com')
    expect(visitorText('www.acme.cn 旗舰店', 80)).toBe('www．acme．cn 旗舰店')
  })

  it('leaves ordinary names alone, on one line, cut by characters', () => {
    expect(visitorText('  Acme   Foods,\nInc. ', 80)).toBe('Acme Foods, Inc.')
    expect(visitorText('杭州山茶食品有限公司', 80)).toBe('杭州山茶食品有限公司')
    expect(visitorText('😀'.repeat(45), 40)).toBe(`${'😀'.repeat(40)}…`)
  })
})

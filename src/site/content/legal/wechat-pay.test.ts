import { describe, expect, it } from 'vitest'

import { legalPages } from '.'
import { WECHAT_PAY_LEGAL_EDITS, withWechatPay } from './wechat-pay'

// T73: STRIPE_WECHAT_PAY off serves the legal pages untouched; on, each phrase that names Alipay
// as a way to pay also names WeChat Pay.
const text = (value: unknown) => JSON.stringify(value)

describe('legal copy and STRIPE_WECHAT_PAY', () => {
  it('off: no page names WeChat Pay', () => {
    // "WeChat ID" (the business inquiry form's optional field, T86) is not a way to pay.
    for (const page of legalPages) expect(text(page)).not.toMatch(/wechat(?! id)/i)
  })

  it('every edited phrase is still in the pages, exactly once', () => {
    const all = legalPages.map(text).join('\n')
    for (const [from] of WECHAT_PAY_LEGAL_EDITS) expect(all.split(from).length - 1).toBe(1)
  })

  it('on: each phrase names WeChat Pay, everything else unchanged', () => {
    for (const page of legalPages) {
      const edited = withWechatPay(page)
      expect(edited.path).toBe(page.path)
      const expected = WECHAT_PAY_LEGAL_EDITS.reduce((out, [from, to]) => out.replace(from, to), text(page))
      expect(text(edited)).toBe(expected)
    }
    const all = legalPages.map((page) => text(withWechatPay(page))).join('\n')
    for (const [, to] of WECHAT_PAY_LEGAL_EDITS) expect(all).toContain(to)
  })
})

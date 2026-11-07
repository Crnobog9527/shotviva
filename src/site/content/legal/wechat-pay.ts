// T73: while STRIPE_WECHAT_PAY is on, the legal pages name WeChat Pay wherever they name Alipay
// as a way to pay. Off, the pages are exactly the pre-T73 text. Each edit replaces one whole
// phrase; legal.test.ts checks every phrase is still found, so a copy change cannot silently
// drop one.
export const WECHAT_PAY_LEGAL_EDITS: readonly (readonly [from: string, to: string])[] = [
  ['(for example card or Alipay)', '(for example card, Alipay or WeChat Pay)'],
  ['including Alipay payments and payments through Waffo', 'including Alipay and WeChat Pay payments and payments through Waffo'],
  ['Membership plans paid with Alipay, or through Waffo,', 'Membership plans paid with Alipay or WeChat Pay, or through Waffo,'],
  ['Membership bought with Alipay:', 'Membership bought with Alipay or WeChat Pay:'],
]

function edit(text: string): string {
  return WECHAT_PAY_LEGAL_EDITS.reduce((out, [from, to]) => out.replace(from, to), text)
}

// The page with every string run through the edits; structure, paths and dates untouched.
export function withWechatPay<T>(value: T): T {
  if (typeof value === 'string') return edit(value) as T
  if (Array.isArray(value)) return value.map((item: unknown) => withWechatPay(item)) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, withWechatPay(item)])) as T
  }
  return value
}

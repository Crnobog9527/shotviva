// WeChat Pay's cap on Waffo (Owner 2026-11-21; docs.waffo.ai payments/methods): at most CN¥1,000
// per payment, and per buyer per merchant per calendar month; above it Waffo hides WeChat Pay
// and the buyer pays another way. Alipay has no such cap. Pure, shared by the paywall and checkout.
export const WECHAT_LIMIT_CNY = 1000

// A USD price clearly above the cap at any recent exchange rate (CN¥1,000 is about $135-145), so
// the paywall can warn and checkout can leave WeChat Pay out. Prices up to it (the monthly plans,
// every pack) may fit; Waffo still hides WeChat Pay when a payment or the month goes over.
export const WECHAT_OVER_LIMIT_CENTS = 13_000

export const overWechatLimit = (cents: number): boolean => cents > WECHAT_OVER_LIMIT_CENTS

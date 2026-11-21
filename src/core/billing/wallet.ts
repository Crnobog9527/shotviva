import 'server-only'

import { wechatPayEnabled } from './stripe/client'
import { paymentChannel, waffoWechatPayEnabled } from './waffo/config'

// Whether the live channel's wallet line offers WeChat Pay beside Alipay: STRIPE_WECHAT_PAY on
// Stripe (T73), WAFFO_WECHAT_PAY on Waffo. The paywall, /pricing and its FAQ word the line by it.
export function walletOffersWechat(): boolean {
  return paymentChannel() === 'waffo' ? waffoWechatPayEnabled() : wechatPayEnabled()
}

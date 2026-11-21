import type { PendingDiscount } from "../../codes"
import type { PaymentChannel } from "../../config"
import type { CheckoutMethod } from "../stripe/catalog"
import { overWechatLimit } from "../wechat-limit"
import type { Period } from "./offer"

// Which paywall message each payment line uses (DESIGN §4.5, ARCHITECTURE §6.3). On both
// channels a card plan renews and can be cancelled anytime, the wallet line buys one period that
// does not renew, and packs are one-time (Waffo card subscriptions since T50). The channel
// changes two labels: Waffo's subscription page takes cards, not Apple Pay or Google Pay (a pack's page does), and
// the wallet line names WeChat Pay beside Alipay when the channel's checkout offers it
// (`wechatPay`: STRIPE_WECHAT_PAY on Stripe, T73; WAFFO_WECHAT_PAY on Waffo); off, it reads Alipay. 中国银行卡
// (zh pages on Stripe, T64) reads like a card: plans renew, packs are one-time. On zh pages the
// Managed Payments card is worded 海外银行卡 by the zh catalog itself. Pure, so every line is
// unit-tested.

export type PaywallMessage = { key: string; values?: Record<string, string> }

// `oneTime`: a pack. Waffo's one-time card page also offers Apple Pay and Google Pay, its
// subscription page cards only, so only a pack's card row on Waffo carries the full wording.
export function methodLabel(channel: PaymentChannel, method: CheckoutMethod, wechatPay = false, oneTime = false): PaywallMessage {
  if (method === "card") return { key: channel !== "waffo" ? "card" : oneTime ? "cardWallets" : "cardOnly" }
  if (method === "cn_card") return { key: "cnCard" }
  return { key: wechatPay ? "wallet" : "alipay" }
}

// Waffo's WeChat Pay takes at most CN¥1,000 a payment and a month (wechat-limit.ts); Alipay has no
// cap. Shown before the buyer leaves for Waffo, only while Waffo offers WeChat Pay; a price over
// the cap gets the stronger line. Stripe's WeChat Pay has no such cap in this copy.
export function wechatCapNote(channel: PaymentChannel, wechatPay: boolean, cents: number | null): (PaywallMessage & { over: boolean }) | null {
  if (channel !== "waffo" || !wechatPay) return null
  const over = cents !== null && overWechatLimit(cents)
  return { key: over ? "wechatCapOver" : "wechatCap", over }
}

export function methodNote(
  _channel: PaymentChannel,
  input: { kind: "plan" | "pack"; method: CheckoutMethod; period: Period },
): PaywallMessage {
  if (input.kind === "pack") return { key: "oneTime" }
  return input.method === "alipay" ? { key: "walletOnce", values: { period: input.period } } : { key: "cardRenews" }
}

export function planFinePrint(
  _channel: PaymentChannel,
  input: { method: CheckoutMethod; period: Period; price: string },
): PaywallMessage {
  return input.method === "alipay"
    ? { key: "finePlanWallet", values: { period: input.period } }
    : { key: "finePlanCard", values: { period: input.period, price: input.price } }
}

// /pricing's "Pay with" rows cover plans and packs at once (comps-v3-b pricing.html).
export function pricingMethodNote(_channel: PaymentChannel, method: CheckoutMethod): PaywallMessage {
  return { key: method === "alipay" ? "payNoteWallet" : "payNoteCard" }
}

// Stripe repeating windows run from the first payment in calendar months. A yearly invoice
// is discounted in full if its billing date falls inside the window.
export function discountTerm(
  offer: Pick<PendingDiscount, "duration" | "months">, singlePayment: boolean, period: Period,
): { key: string; values?: Record<string, number> } {
  if (singlePayment) return { key: "codeOnce" }
  if (offer.duration === "once") return { key: period === "year" ? "codeFirstYear" : "codeFirstMonth" }
  if (offer.duration === "forever") return { key: "codeEvery" }
  const months = offer.months ?? 0
  if (period === "year") return { key: "codeAnnualPayments", values: { count: Math.ceil(months / 12) } }
  return { key: "codeMonths", values: { months } }
}

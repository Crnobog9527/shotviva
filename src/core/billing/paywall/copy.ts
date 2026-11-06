import type { PaymentChannel } from "../../config"
import type { CheckoutMethod } from "../stripe/catalog"
import type { Period } from "./offer"

// Which paywall message each payment line uses, by channel (DESIGN §4.5, ARCHITECTURE §6.3).
// On Stripe a card plan renews and Alipay buys one period. On Waffo every option is a one-time
// payment, so no line may mention renewing or cancelling. Pure, so the switch is unit-tested.

export type PaywallMessage = { key: string; values?: Record<string, string> }

export function methodLabel(channel: PaymentChannel, method: CheckoutMethod): PaywallMessage {
  // Waffo's one-time page offers card and Alipay, not Apple Pay or Google Pay.
  if (method === "card") return { key: channel === "waffo" ? "cardOnly" : "card" }
  return { key: "alipay" }
}

export function methodNote(
  channel: PaymentChannel,
  input: { kind: "plan" | "pack"; method: CheckoutMethod; period: Period },
): PaywallMessage {
  if (input.kind === "pack") return { key: "oneTime" }
  if (channel === "waffo") return { key: "planOnce", values: { period: input.period } }
  return input.method === "card" ? { key: "cardRenews" } : { key: "walletOnce", values: { period: input.period } }
}

export function planFinePrint(
  channel: PaymentChannel,
  input: { method: CheckoutMethod; period: Period; price: string },
): PaywallMessage {
  if (channel === "waffo") return { key: "finePlanOnce", values: { period: input.period } }
  return input.method === "card"
    ? { key: "finePlanCard", values: { period: input.period, price: input.price } }
    : { key: "finePlanWallet", values: { period: input.period } }
}

// /pricing's "Pay with" rows cover plans and packs at once (comps-v3-b pricing.html). On Waffo
// nothing renews, so neither row may say so.
export function pricingMethodNote(channel: PaymentChannel, method: CheckoutMethod): PaywallMessage {
  if (channel === "waffo") return { key: "payNoteOnce" }
  return { key: method === "card" ? "payNoteCard" : "payNoteWallet" }
}

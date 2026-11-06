import type { PaymentChannel } from "../../config"
import type { CheckoutMethod } from "../stripe/catalog"
import type { Period } from "./offer"

// Which paywall message each payment line uses (DESIGN §4.5, ARCHITECTURE §6.3). On both
// channels a card plan renews and can be cancelled anytime, Alipay buys one period that does not
// renew, and packs are one-time (Waffo card subscriptions since T50). The channel only changes
// the card label: Waffo's subscription page takes cards, not Apple Pay or Google Pay. Pure, so
// every line is unit-tested.

export type PaywallMessage = { key: string; values?: Record<string, string> }

export function methodLabel(channel: PaymentChannel, method: CheckoutMethod): PaywallMessage {
  if (method === "card") return { key: channel === "waffo" ? "cardOnly" : "card" }
  return { key: "alipay" }
}

export function methodNote(
  _channel: PaymentChannel,
  input: { kind: "plan" | "pack"; method: CheckoutMethod; period: Period },
): PaywallMessage {
  if (input.kind === "pack") return { key: "oneTime" }
  return input.method === "card" ? { key: "cardRenews" } : { key: "walletOnce", values: { period: input.period } }
}

export function planFinePrint(
  _channel: PaymentChannel,
  input: { method: CheckoutMethod; period: Period; price: string },
): PaywallMessage {
  return input.method === "card"
    ? { key: "finePlanCard", values: { period: input.period, price: input.price } }
    : { key: "finePlanWallet", values: { period: input.period } }
}

// /pricing's "Pay with" rows cover plans and packs at once (comps-v3-b pricing.html).
export function pricingMethodNote(_channel: PaymentChannel, method: CheckoutMethod): PaywallMessage {
  return { key: method === "card" ? "payNoteCard" : "payNoteWallet" }
}

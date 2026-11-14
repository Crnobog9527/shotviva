"use client"

import { useCallback, useState } from "react"

import { MEMBERSHIP_TIERS, type MembershipTier, type ProductId } from "../../config"
import type { CheckoutMethod } from "../stripe/catalog"
import type { Period } from "./offer"

// One screen (comps-v3-b paywall.html, signed off 2026-11-06; DESIGN §6.9 takes precedence over
// the two steps of §4.5): Monthly / Yearly, then one pick among the three tiers and the three
// packs, then the payment method and checkout.
export type PaywallPick = MembershipTier | ProductId

export type PaywallChoice = { period: Period; pick: PaywallPick; method: CheckoutMethod }

// What an entry point may preselect. `step: "packs"` (with or without `packId`) opens on a pack;
// anything else opens on `tier`. `step` stays so the existing callers (account, batch rows,
// /pricing) keep their shape.
// `moment` (T107): the limit the user just met, which sets the paywall's lead line and what it
// shows above the plans (a batch example, the pack-or-plan comparison); `needed` is the credits
// short for the "credits" moment.
export type PaywallMoment = "watermark" | "photos" | "templates" | "credits"

export type PaywallOpenOptions = {
  step?: "tiers" | "period" | "packs"
  period?: Period
  tier?: MembershipTier
  packId?: ProductId
  planId?: ProductId
  moment?: PaywallMoment
  needed?: number
}

// Monthly and Pro start selected (DESIGN §4.5 「默认显示按月」, Owner 2026-11-08): opening on
// Yearly let careless buyers read the yearly per-month price as the monthly one. The Yearly
// segment keeps its "Save up to 40%" badge. A member holding a yearly plan still opens on
// Yearly (standing-pick openOptionsFor).
export const DEFAULT_CHOICE: PaywallChoice = { period: "month", pick: "pro", method: "card" }
const DEFAULT_PACK: ProductId = "pack_m"

export function isTierPick(pick: PaywallPick): pick is MembershipTier {
  return (MEMBERSHIP_TIERS as readonly string[]).includes(pick)
}

// `method` is the first method the page lists (catalog offeredMethods): Card on English pages,
// 中国银行卡 on zh pages over Stripe (ARCHITECTURE §6.3, T64).
export function choiceFor(options: PaywallOpenOptions = {}, method: CheckoutMethod = DEFAULT_CHOICE.method): PaywallChoice {
  const pick = options.step === "packs" || (options.packId && !options.tier) ? (options.packId ?? DEFAULT_PACK) : (options.planId ?? options.tier ?? DEFAULT_CHOICE.pick)
  return { ...DEFAULT_CHOICE, period: options.period ?? DEFAULT_CHOICE.period, pick, method }
}

export function usePaywallState(firstMethod: CheckoutMethod = DEFAULT_CHOICE.method) {
  const [choice, setChoice] = useState<PaywallChoice>(() => choiceFor({}, firstMethod))
  const update = useCallback((patch: Partial<PaywallChoice>) => setChoice((current) => ({ ...current, ...patch })), [])
  const reset = useCallback((options?: PaywallOpenOptions) => setChoice(choiceFor(options, firstMethod)), [firstMethod])
  return { choice, update, reset }
}

export type PaywallState = ReturnType<typeof usePaywallState>

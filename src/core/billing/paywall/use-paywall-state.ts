"use client"

import { useCallback, useState } from "react"

import type { MembershipTier, ProductId } from "../../config"
import type { CheckoutMethod } from "../stripe/catalog"
import type { Period } from "./offer"

// Two steps, at most three choices per screen (DESIGN §4.5): first the tier (or the packs
// entry), then the period or the pack, with the payment method.
export type PaywallStep = "tiers" | "period" | "packs"

export type PaywallChoice = {
  step: PaywallStep
  period: Period
  tier: MembershipTier
  packId: ProductId
  method: CheckoutMethod
}

export type PaywallOpenOptions = Partial<Pick<PaywallChoice, "step" | "period" | "tier" | "packId">>

// Yearly and Pro start selected, as in the comp: the recommended tier at its best rate.
export const DEFAULT_CHOICE: PaywallChoice = { step: "tiers", period: "year", tier: "pro", packId: "pack_m", method: "card" }

export function usePaywallState() {
  const [choice, setChoice] = useState<PaywallChoice>(DEFAULT_CHOICE)
  const update = useCallback((patch: Partial<PaywallChoice>) => setChoice((current) => ({ ...current, ...patch })), [])
  const reset = useCallback((options: PaywallOpenOptions = {}) => setChoice({ ...DEFAULT_CHOICE, ...options }), [])
  return { choice, update, reset }
}

export type PaywallState = ReturnType<typeof usePaywallState>

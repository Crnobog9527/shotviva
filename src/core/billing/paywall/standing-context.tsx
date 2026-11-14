"use client"

import { createContext, useContext, useEffect, useState } from "react"

import type { MembershipTier, ProductId } from "../../config"
import { holdsMembership, NO_STANDING, type MemberStanding } from "../subscription/standing"
import type { Period } from "./offer"
import type { PlanStanding } from "./standing-pick"

// What the signed-in buyer already holds (T66), so the paywall and /pricing can mark lower and
// same plans as not available and higher ones as Upgrade. The pages around the paywall are
// prerendered, so the standing arrives later, through StandingFeed in a request-time slot
// (core/billing/standing StandingSlot); until then, and for anyone signed out, nothing is
// held and every plan reads as before. The server checks again at checkout (409).
// Only this holder is in the first load; the rank rule (standing-pick, upgrade-rule) is
// fetched on demand once a membership is actually held.

type StandingApi = { standing: MemberStanding; setStanding(standing: MemberStanding): void }

export const StandingContext = createContext<StandingApi>({ standing: NO_STANDING, setStanding: () => {} })

export function useStanding(): MemberStanding {
  return useContext(StandingContext).standing
}

export function StandingFeed({ standing }: { standing: MemberStanding }) {
  const { setStanding } = useContext(StandingContext)
  const { subscription, subscriptionRank, tier } = standing
  useEffect(() => setStanding({ subscription, subscriptionRank, tier }), [setStanding, subscription, subscriptionRank, tier])
  return null
}

export type PlanReader = (tier: MembershipTier, period: Period, id?: ProductId) => PlanStanding

const OPEN: PlanStanding = { upgrade: false, lock: null }
const openReader: PlanReader = () => OPEN

// How each plan reads for this buyer. Everyone without a membership gets "open" at once and
// never loads the rule; a member's labels appear once the rule chunk is in (a moment after the
// standing itself, which streams in after the page anyway).
export function usePlanReader(): PlanReader {
  const standing = useStanding()
  const [loaded, setLoaded] = useState<{ standing: MemberStanding; read: PlanReader } | null>(null)
  useEffect(() => {
    if (!holdsMembership(standing)) return
    let live = true
    void import("./standing-pick").then((rule) => {
      if (live) setLoaded({ standing, read: (tier, period, id) => rule.planStanding(standing, tier, period, id) })
    })
    return () => {
      live = false
    }
  }, [standing])
  return loaded?.standing === standing ? loaded.read : openReader
}

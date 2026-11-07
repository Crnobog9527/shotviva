"use client"

import { createContext, useContext, useEffect } from "react"

import { NO_STANDING, type MemberStanding } from "../subscription/upgrade-rule"

// What the signed-in buyer already holds (T66), so the paywall and /pricing can mark lower and
// same plans as not available and higher ones as Upgrade. The pages around the paywall are
// prerendered, so the standing arrives later, through StandingFeed in a request-time slot
// (core/billing/subscription StandingSlot); until then, and for anyone signed out, nothing is
// held and every plan reads as before. The server checks again at checkout (409).

type StandingApi = { standing: MemberStanding; setStanding(standing: MemberStanding): void }

export const StandingContext = createContext<StandingApi>({ standing: NO_STANDING, setStanding: () => {} })

export function useStanding(): MemberStanding {
  return useContext(StandingContext).standing
}

export function StandingFeed({ standing }: { standing: MemberStanding }) {
  const { setStanding } = useContext(StandingContext)
  const { subscription, tier } = standing
  useEffect(() => setStanding({ subscription, tier }), [setStanding, subscription, tier])
  return null
}

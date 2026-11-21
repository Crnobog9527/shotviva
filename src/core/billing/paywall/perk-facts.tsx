"use client"

import { createContext, useContext, useMemo } from "react"

import { pricingV2 } from "../../public-env"
import type { MembershipTier } from "../../config"
import type { PhotoPrices } from "../photo-estimate"
import { tierPerks, type MemberPackOff, type TierPerks } from "./perks"

// What the plans need to know besides the products, handed down by PaywallProvider: whether the
// wishlist is open (its vote perk) and the live Standard prices (the photo estimate). Read on
// the server from cached sources, so the cards stay in the prerendered HTML.
// `packMemberOff` is filled by PaywallProvider from the listed packs (perks.memberPackOff).
export type PerkFacts = { wishlistLive: boolean; photoPrices: PhotoPrices | null; packMemberOff?: MemberPackOff | null }

export const NO_PERK_FACTS: PerkFacts = { wishlistLive: false, photoPrices: null }

export const PerkFactsContext = createContext<PerkFacts>(NO_PERK_FACTS)

export function usePerkFacts(): PerkFacts {
  return useContext(PerkFactsContext)
}

// The member pack rate is live with the v2 catalogue only (discount-context, use-checkout).
export function useTierPerks(tier: MembershipTier): TierPerks {
  const { wishlistLive, packMemberOff } = usePerkFacts()
  return useMemo(() => tierPerks(tier, { wishlistLive, memberPacks: pricingV2 ? packMemberOff : null }), [tier, wishlistLive, packMemberOff])
}

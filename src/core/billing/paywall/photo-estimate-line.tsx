"use client"

import { useFormatter, useTranslations } from "next-intl"
import type { ReactNode } from "react"

import { photoRange, type PhotoRange } from "../photo-estimate"
import { monthlyAllowance, type Period, type TierOffer } from "./offer"
import { usePerkFacts } from "./perk-facts"

// The plan's monthly credits as photos, from the live Standard prices (perk-facts). Monthly
// credits on both periods: a yearly plan grants the same twelve months upfront.
export function usePhotoRange(offer: TierOffer, period?: Period): PhotoRange | null {
  return photoRange(monthlyAllowance(offer, period), usePerkFacts().photoPrices)
}

// "99–132", or one number when every template costs the same.
export function useRangeText(): (range: PhotoRange) => string {
  const format = useFormatter()
  return ({ low, high }) => (low === high ? format.number(high) : `${format.number(low)}–${format.number(high)}`)
}

const mono = (chunks: ReactNode) => <span className="font-mono">{chunks}</span>

// "About 99–132 photos a month", under the credits line; nothing without a priced template.
export function PhotoEstimateLine({ offer, period }: { offer: TierOffer; period: Period }) {
  const t = useTranslations("paywall")
  const range = usePhotoRange(offer, period)
  const text = useRangeText()
  if (!range) return null
  return <p className="mt-1 text-caption text-foreground">{t.rich("photoEstimate", { range: text(range), n: mono })}</p>
}

// The one footnote the estimate carries (Owner 2026-11-10), below the plans.
export function PhotoEstimateNote({ className }: { className?: string }) {
  const t = useTranslations("paywall")
  if (!usePerkFacts().photoPrices) return null
  return <p className={`text-caption leading-[1.4] text-muted-foreground ${className ?? ""}`}>{t("photoEstimateNote")}</p>
}

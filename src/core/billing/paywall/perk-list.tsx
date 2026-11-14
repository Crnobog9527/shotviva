"use client"

import { useTranslations } from "next-intl"

import type { TierPerks } from "./perks"

export function Tick({ className = "text-[var(--tier-tick)]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`mt-0.5 size-[15px] flex-none ${className}`} fill="none" stroke="currentColor" strokeWidth={2.5}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

// Live perks with a tick; "Coming soon" is its own group below, muted and without ticks, never
// mixed in with what exists (DESIGN §4.5). Every number comes from TIER_LIMITS (perks.ts).
export function PerkList({ perks }: { perks: TierPerks }) {
  const t = useTranslations("paywall")
  return (
    <div className="tier-perks mt-3 grid gap-1.5 border-t border-[var(--wash-strong)] pt-3 text-caption leading-[1.35]">
      <p className="font-semibold text-muted-foreground">{t(`perkHeadings.${perks.heading}`)}</p>
      <ul className="grid gap-1.5">
        {perks.live.map((perk) => (
          <li key={perk.key} className="flex items-start gap-2 text-bone-dim">
            <Tick />
            {t(`perks.${perk.key}`, perk.values)}
          </li>
        ))}
      </ul>
      {perks.soon.length > 0 ? (
        <>
          <p className="mt-1.5 font-semibold text-muted-foreground">{t("comingSoon")}</p>
          <ul className="grid gap-1.5">
            {perks.soon.map((perk) => (
              <li key={perk.key} className="pl-[23px] text-muted-foreground">
                {t(`perks.${perk.key}`, perk.values)}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  )
}

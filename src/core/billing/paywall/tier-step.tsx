"use client"

import { useTranslations } from "next-intl"

import type { PackProduct } from "../../config"
import { buttonVariants } from "../../ui/button"
import { cn } from "../../ui/cn"
import { BillingToggle } from "./billing-toggle"
import { yearlySavingPct, type TierOffer } from "./offer"
import { tierPerks } from "./perks"
import { TierCard } from "./tier-card"
import type { PaywallState } from "./use-paywall-state"
import { useMoney } from "./use-money"

type Props = { offers: TierOffer[]; packFrom: PackProduct | undefined; wishlistLive: boolean; state: PaywallState }

// Step one: Monthly / Yearly and the three tiers, Pro preselected. Cards are compact and only
// the chosen one opens its perks, so all three fit one phone screen without scrolling (DESIGN
// §4.5); the full price breakdown follows on step two.
export function TierStep({ offers, packFrom, wishlistLive, state }: Props) {
  const t = useTranslations("paywall")
  const money = useMoney()
  const { choice, update } = state
  return (
    <>
      <BillingToggle period={choice.period} onChange={(period) => update({ period })} savePct={choice.period === "year" ? yearlySavingPct(offers) : null} />
      <div role="radiogroup" aria-label={t("plansLabel")} className="grid gap-2.5">
        {offers.map((offer) => {
          const selected = offer.tier === choice.tier
          return (
            <label key={offer.tier} className="press block cursor-pointer rounded-panel has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-ring">
              <input type="radio" name="paywall-tier" value={offer.tier} checked={selected} onChange={() => update({ tier: offer.tier })} className="sr-only" />
              <TierCard
                offer={offer}
                period={choice.period}
                selected={selected}
                density="compact"
                perks={selected ? tierPerks(offer.tier, { wishlistLive }) : null}
                check={<Check on={selected} />}
              />
            </label>
          )
        })}
      </div>
      {packFrom ? (
        <button type="button" onClick={() => update({ step: "packs" })} className="mt-3 inline-flex min-h-11 items-center gap-1 text-caption text-bone-dim">
          {t("packsLink", { price: money(packFrom.priceUsd) })}
          <span aria-hidden="true" className="text-primary">→</span>
        </button>
      ) : null}
      <div className="sticky bottom-0 -mx-4 mt-3 bg-[linear-gradient(transparent,var(--popover)_30%)] px-4 pt-3 pb-1">
        <button
          type="button"
          onClick={() => update({ step: "period" })}
          className={buttonVariants({ variant: "cta-neutral", size: "cta", className: cn(choice.tier === "max" && "bg-[image:var(--chrome)] text-[var(--tier-max-ink)]") })}
        >
          {t("continueTier", { tier: t(`tiers.${choice.tier}`) })}
        </button>
      </div>
    </>
  )
}

function Check({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-6 flex-none place-items-center rounded-full transition-colors",
        on ? "bg-[var(--tier-check)] text-[var(--tier-check-ink)]" : "shadow-[inset_0_0_0_1.5px_var(--input)]",
      )}
    >
      <svg viewBox="0 0 24 24" className={cn("size-[13px]", !on && "opacity-0")} fill="none" stroke="currentColor" strokeWidth={3}>
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  )
}

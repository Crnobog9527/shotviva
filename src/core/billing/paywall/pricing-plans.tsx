"use client"

import { useTranslations } from "next-intl"
import { useState } from "react"

import type { PackProduct, SiteProduct } from "../../config"
import { buttonVariants } from "../../ui/button"
import { cn } from "../../ui/cn"
import { BillingToggle } from "./billing-toggle"
import { packLooks, packOffers, tierOffers, yearlySavingPct, type Period, type TierOffer } from "./offer"
import { PackCard } from "./pack-card"
import { usePaywall, type PaywallTrigger } from "./paywall-context"
import { tierPerks } from "./perks"
import { useStanding } from "./standing-context"
import { planStanding, type PlanStanding } from "./standing-pick"
import { TierCard } from "./tier-card"
import { useMoney } from "./use-money"

const ghost = "w-full min-h-12 rounded-control"

// /pricing (DESIGN §4.5, comps-v3-b pricing.html): the paywall's cards laid out flat, three
// tiers side by side from md up, the packs in a row of three below; on phones they stack.
// Only Pro's "Choose Pro" is a solid primary; Starter and Max are ghost buttons (Max's in
// gold). Every button opens the same paywall with that plan or pack picked; for a member the
// lower and current plans are locked and higher ones say Upgrade (T66). Prices render on
// the server (Yearly first), so they are in the static HTML (建站规格 R5).
export function PricingPlans({ products, wishlistLive }: { products: readonly SiteProduct[]; wishlistLive: boolean }) {
  const t = useTranslations("paywall")
  const paywall = usePaywall()
  const standing = useStanding()
  const [period, setPeriod] = useState<Period>("year")
  const offers = tierOffers(products)
  return (
    <section aria-label={t("plansLabel")}>
      <BillingToggle period={period} onChange={setPeriod} savePct={yearlySavingPct(offers)} className="mt-6 md:mt-8 md:w-[400px]" />
      <div className="mt-3 grid gap-2 md:mt-8 md:grid-cols-3 md:gap-4">
        {offers.map((offer) => {
          const member = planStanding(standing, offer.tier, period)
          return (
            <div key={offer.tier} data-tier={offer.tier} className="tier-shell">
              <TierCard
                offer={offer}
                period={period}
                selected={false}
                perks={tierPerks(offer.tier, { wishlistLive })}
                lock={member.lock}
                footer={<TierButton offer={offer} member={member} onPick={() => paywall.open(pricingTrigger(), { tier: offer.tier, period })} />}
              />
            </div>
          )
        })}
      </div>
      <PackRow packs={packOffers(products)} onPick={(packId) => paywall.open(pricingTrigger(), { step: "packs", packId })} />
    </section>
  )
}

// "Choose Pro", or for a member (T66) "Upgrade to Pro" on a higher plan and a button that cannot
// be pressed on their own ("Your plan") or a lower one ("Not available"; the card says why).
function TierButton({ offer, member, onPick }: { offer: TierOffer; member: PlanStanding; onPick(): void }) {
  const t = useTranslations("paywall")
  const tier = t(`tiers.${offer.tier}`)
  if (member.lock) {
    return (
      <button type="button" disabled className={buttonVariants({ variant: "glass", size: "touch", className: cn(ghost, "disabled:opacity-60") })}>
        {t(member.lock === "current" ? "yourPlan" : "notAvailable")}
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={onPick}
      className={
        offer.tier === "pro"
          ? buttonVariants({ variant: "cta", size: "touch", className: "min-h-12 rounded-control" })
          : buttonVariants({ variant: "glass", size: "touch", className: cn(ghost, "text-[var(--tier-ghost-ink)]") })
      }
    >
      {t(member.upgrade ? "upgradeTo" : "choose", { tier })}
    </button>
  )
}

// Read at click time, not while rendering: the page is static, and its prices must be in the
// prerendered HTML (建站规格 R5), which a search-params read would push to the client.
function pricingTrigger(): PaywallTrigger {
  return new URLSearchParams(window.location.search).get("from") === "graylum" ? "graylum" : "pricing_page"
}

function PackRow({ packs, onPick }: { packs: PackProduct[]; onPick(id: PackProduct["id"]): void }) {
  const t = useTranslations("paywall")
  const money = useMoney()
  const looks = packLooks(packs)
  return (
    <>
      <div className="mt-6 mb-2 flex flex-wrap items-baseline justify-between gap-x-3 px-0.5 md:mt-8">
        <h2 className="text-headline font-semibold">{t("packsTitle")}</h2>
        <span className="text-caption text-muted-foreground">{t("packsNote")}</span>
      </div>
      <div className="grid gap-2 md:grid-cols-3 md:gap-4">
        {packs.map((pack, i) => (
          <div key={pack.id} className="pack-shell">
            <PackCard
              pack={pack}
              look={looks[i] ?? { tone: "graphite", flag: null }}
              action={
                <button
                  type="button"
                  onClick={() => onPick(pack.id)}
                  aria-label={t("buyPackLabel", { count: pack.credits, price: money(pack.priceUsd) })}
                  className={buttonVariants({ variant: "glass", size: "touch", className: "w-full rounded-full" })}
                >
                  {t("buy")}
                </button>
              }
            />
          </div>
        ))}
      </div>
    </>
  )
}

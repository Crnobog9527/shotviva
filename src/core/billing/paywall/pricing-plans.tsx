"use client"

import { useTranslations } from "next-intl"
import { useState } from "react"

import type { PackProduct, SiteProduct } from "../../config"
import { buttonVariants } from "../../ui/button"
import { cn } from "../../ui/cn"
import { BillingToggle } from "./billing-toggle"
import { packOffers, perCreditUsd, tierOffers, yearlySavingPct, type Period } from "./offer"
import { usePaywall, type PaywallTrigger } from "./paywall-context"
import { tierPerks } from "./perks"
import { TierCard } from "./tier-card"
import { PackCredits } from "./pack-credits"
import { useMoney } from "./use-money"

// /pricing (DESIGN §4.5): the paywall's information laid out flat, three tiers side by side
// from md up, the packs in one row below; on phones it stacks like the paywall. Every button
// opens the same paywall at its second step. Prices render on the server (initial Yearly).
export function PricingPlans({ products, wishlistLive }: { products: readonly SiteProduct[]; wishlistLive: boolean }) {
  const t = useTranslations("paywall")
  const paywall = usePaywall()
  const [period, setPeriod] = useState<Period>("year")
  const offers = tierOffers(products)
  return (
    <section aria-label={t("plansLabel")} className="mx-auto w-full max-w-5xl px-4">
      <div className="mx-auto max-w-sm">
        <BillingToggle period={period} onChange={setPeriod} savePct={period === "year" ? yearlySavingPct(offers) : null} />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {offers.map((offer) => (
          <TierCard
            key={offer.tier}
            offer={offer}
            period={period}
            selected={offer.tier === "pro"}
            perks={tierPerks(offer.tier, { wishlistLive })}
            footer={
              <button
                type="button"
                onClick={() => paywall.open(pricingTrigger(), { step: "period", tier: offer.tier, period })}
                className={buttonVariants({
                  variant: "cta-neutral",
                  size: "touch",
                  className: cn("mt-4 w-full rounded-button", offer.tier === "max" && "bg-[image:var(--chrome)] text-[var(--tier-max-ink)]"),
                })}
              >
                {t("choose", { tier: t(`tiers.${offer.tier}`) })}
              </button>
            }
          />
        ))}
      </div>
      <PackRow packs={packOffers(products)} onPick={(packId) => paywall.open(pricingTrigger(), { step: "packs", packId })} />
    </section>
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
  return (
    <>
      <div className="mt-8 mb-3 flex flex-wrap items-baseline justify-between gap-2 px-0.5">
        <h2 className="text-headline font-semibold">{t("packsTitle")}</h2>
        <span className="text-caption text-muted-foreground">{t("oneTimeNoSub")}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {packs.map((pack) => (
          <button key={pack.id} type="button" onClick={() => onPick(pack.id)} className="press hairline rounded-control bg-[var(--tier-graphite)] px-2.5 py-3 text-left">
            <PackCredits count={pack.credits} />
            <span className="mt-2.5 block text-body font-semibold">{money(pack.priceUsd)}</span>
            <span className="mt-1.5 block text-caption text-muted-foreground">{t("perCreditShort", { price: money(perCreditUsd(pack)) })}</span>
          </button>
        ))}
      </div>
    </>
  )
}

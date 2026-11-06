"use client"

import { useTranslations } from "next-intl"
import type { ReactNode } from "react"

import { cn } from "../../ui/cn"
import { perCreditUsd, perMonthUsd, productFor, yearlySavingUsd, type Period, type TierOffer } from "./offer"
import { PerkList } from "./perk-list"
import type { TierPerks } from "./perks"
import { useMoney } from "./use-money"

const FLAGS = { starter: null, pro: "recommended", max: "bestValue" } as const

type Props = {
  offer: TierOffer
  period: Period
  perks: TierPerks
  selected: boolean
  // The paywall's radio check, top right.
  check?: ReactNode
  // /pricing's per-tier button, pinned to the bottom so the three cards line up.
  footer?: ReactNode
}

// One tier in its material (DESIGN §4.5, comps-v3-b tiers.css): price a month, credits, price
// per credit, the yearly saving only on Yearly, then its perks. Same card on /pricing and in
// the paywall, so both say exactly the same thing.
export function TierCard({ offer, period, perks, selected, check, footer }: Props) {
  const t = useTranslations("paywall")
  const flag = FLAGS[offer.tier]
  return (
    <div className="tier-card flex h-full flex-col px-4 pt-4 pb-3" data-tier={offer.tier} data-selected={selected}>
      <div className="flex items-start justify-between gap-2">
        <span>
          <span className="tier-name text-headline font-semibold tracking-[-0.015em] text-[var(--tier-ink)]">{t(`tiers.${offer.tier}`)}</span>
          {flag ? (
            <span className="ml-2 inline-flex h-6 items-center rounded-full [background:var(--tier-flag)] px-2 align-[2px] text-caption leading-none font-semibold text-[var(--tier-flag-ink)]">
              {t(flag)}
            </span>
          ) : null}
        </span>
        {check}
      </div>
      {/* Keyed on the period: the numbers fade in when the toggle changes them. */}
      <div key={period} className="tier-swap">
        <Price offer={offer} period={period} />
        <Facts offer={offer} period={period} />
      </div>
      <PerkList perks={perks} />
      {footer ? <div className="mt-auto pt-4">{footer}</div> : null}
    </div>
  )
}

function Price({ offer, period }: { offer: TierOffer; period: Period }) {
  const t = useTranslations("paywall")
  const money = useMoney()
  return (
    <p className="mt-2 flex flex-wrap items-baseline gap-1.5">
      {t.rich("perMonth", {
        price: money(perMonthUsd(offer, period)),
        amt: (chunks) => (
          <span className={cn("font-display text-[40px] leading-[.9] tracking-[-0.02em]", offer.tier === "max" && "text-[var(--tier-max-gold)]")}>{chunks}</span>
        ),
        per: (chunks) => <span className="text-caption text-muted-foreground">{chunks}</span>,
      })}
      {period === "year" ? (
        <s className="ml-1 font-mono text-caption text-muted-foreground" aria-label={t("wasMonthly", { price: money(offer.monthly.priceUsd) })}>
          {money(offer.monthly.priceUsd)}
        </s>
      ) : null}
    </p>
  )
}

// Credits and price per credit; on Yearly the saving on its own plate.
function Facts({ offer, period }: { offer: TierOffer; period: Period }) {
  const t = useTranslations("paywall")
  const money = useMoney()
  const product = productFor(offer, period)
  return (
    <>
      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-caption text-bone-dim">
        <span>{period === "year" ? t("creditsYear", { count: product.credits, price: money(product.priceUsd) }) : t("creditsMonth", { count: product.credits })}</span>
        <span className="font-mono text-muted-foreground">{t("perCredit", { price: money(perCreditUsd(product)) })}</span>
      </p>
      {period === "year" ? (
        <p className="tier-plate mt-2 flex items-center justify-between gap-2 rounded-inner bg-[var(--tier-plate)] py-2 pr-2 pl-3 text-caption text-[var(--tier-plate-ink)]">
          <span className="whitespace-nowrap">{t.rich("savingLabel", { vs: (chunks) => <span className="tier-saving-vs">{chunks}</span> })}</span>
          <b className="font-mono font-semibold whitespace-nowrap">{t("savingAmount", { amount: money(yearlySavingUsd(offer)) })}</b>
        </p>
      ) : null}
    </>
  )
}

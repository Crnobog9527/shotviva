"use client"

import { useTranslations } from "next-intl"
import type { ReactNode } from "react"

import { cn } from "../../ui/cn"
import type { BlockReason } from "../subscription/upgrade-rule"
import { perCreditUsd, perMonthUsd, productFor, yearlySavingUsd, type Period, type TierOffer } from "./offer"
import { PerkList } from "./perk-list"
import type { TierPerks } from "./perks"
import { discountTerm, useProductDiscount } from "./discount-context"
import { useMoney } from "./use-money"

const FLAGS = { starter: null, pro: "recommended", max: "bestValue" } as const

type Props = {
  offer: TierOffer
  period: Period
  perks: TierPerks
  singlePayment?: boolean
  selected: boolean
  // The paywall's radio check, top right.
  check?: ReactNode
  // /pricing's per-tier button, pinned to the bottom so the three cards line up.
  footer?: ReactNode
  // A member's lower or current plan (T66): dimmed, with why it cannot be bought.
  lock?: BlockReason | null
}

// One tier in its material (DESIGN §4.5, comps-v3-b tiers.css): price a month, credits, price
// per credit, the yearly saving only on Yearly, then its perks. Same card on /pricing and in
// the paywall, so both say exactly the same thing.
export function TierCard({ offer, period, perks, selected, check, footer, lock, singlePayment = false }: Props) {
  const t = useTranslations("paywall")
  // The member's own plan wears "Your plan" where the sales flag would be.
  const flag = lock === "current" ? "yourPlan" : lock ? null : FLAGS[offer.tier]
  return (
    <div className="tier-card flex h-full flex-col px-4 pt-4 pb-3" data-tier={offer.tier} data-selected={selected} data-locked={lock ? "true" : undefined}>
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
      {lock === "lower" ? <LockNote /> : null}
      {/* Keyed on the period: the numbers fade in when the toggle changes them. */}
      <div key={period} className="tier-swap">
        <Price offer={offer} period={period} singlePayment={singlePayment} />
        <Facts offer={offer} period={period} />
      </div>
      <PerkList perks={perks} />
      {footer ? <div className="mt-auto pt-4">{footer}</div> : null}
    </div>
  )
}

function Price({ offer, period, singlePayment }: { offer: TierOffer; period: Period; singlePayment: boolean }) {
  const t = useTranslations("paywall")
  const money = useMoney()
  const product = productFor(offer, period)
  const discount = useProductDiscount(product)
  const original = perMonthUsd(offer, period)
  const monthly = discount ? discount.priceUsd / (period === "year" ? 12 : 1) : original
  return (
    <p className="mt-2 flex flex-wrap items-baseline gap-1.5">
      {discount && <s className="text-label text-muted-foreground" aria-label={t("wasMonthly", { price: money(original) })}>{money(original)}</s>}
      {t.rich("perMonth", {
        price: money(monthly),
        amt: (chunks) => (
          <span className={cn("font-display text-[40px] leading-[.9] tracking-[-0.02em]", offer.tier === "max" && "text-[var(--tier-max-gold)]")}>{chunks}</span>
        ),
        per: (chunks) => <span className="text-caption text-muted-foreground">{chunks}</span>,
      })}
      {discount && <span className="text-caption text-bone-dim">{t(discountTerm(discount.offer.duration, singlePayment, period), { months: discount.offer.months ?? 0 })}</span>}
      {!discount && period === "year" ? (
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
  const discount = useProductDiscount(product)
  const effective = discount ? { ...product, priceUsd: discount.priceUsd } : product
  return (
    <>
      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-caption text-bone-dim">
        <span>{period === "year" ? t("creditsYear", { count: product.credits, price: money(effective.priceUsd) }) : t("creditsMonth", { count: product.credits })}</span>
        <span className="font-mono text-muted-foreground">{t("perCredit", { price: money(perCreditUsd(effective)) })}</span>
      </p>
      {!discount && period === "year" ? (
        <p className="tier-plate mt-2 flex items-center justify-between gap-2 rounded-inner bg-[var(--tier-plate)] py-2 pr-2 pl-3 text-caption text-[var(--tier-plate-ink)]">
          {/* The label may wrap and the amount may not: at 320px the Max plate is wider than its card. */}
          <span className="min-w-0">{t.rich("savingLabel", { vs: (chunks) => <span className="tier-saving-vs">{chunks}</span> })}</span>
          <b className="font-mono font-semibold whitespace-nowrap">{t("savingAmount", { amount: money(yearlySavingUsd(offer)) })}</b>
        </p>
      ) : null}
    </>
  )
}

// Why a lower plan is not on offer: plans only go up (ARCHITECTURE §6.2 「升级」).
function LockNote() {
  const t = useTranslations("paywall")
  return (
    <p className="tier-lock mt-2 flex items-start gap-1.5 text-caption leading-[1.35] text-bone-dim">
      <svg viewBox="0 0 24 24" aria-hidden="true" className="mt-px size-[14px] flex-none" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
        <rect x="5" y="11" width="14" height="9" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
      {t("lockLower")}
    </p>
  )
}

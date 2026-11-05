"use client"

import { useTranslations } from "next-intl"
import type { ReactNode } from "react"

import { cn } from "../../ui/cn"
import { perCreditUsd, perMonthUsd, productFor, yearlySavingUsd, type Period, type TierOffer } from "./offer"
import type { TierPerks } from "./perks"
import { useMoney } from "./use-money"

const FLAGS = { starter: null, pro: "recommended", max: "bestValue" } as const

// full: everything, perks with the Coming soon group apart (/pricing, the chosen card).
// compact: name, price and one line, so three tiers fit one phone screen (paywall step one).
export type TierCardDensity = "full" | "compact"

type Props = {
  offer: TierOffer
  period: Period
  perks: TierPerks | null
  selected: boolean
  density?: TierCardDensity
  check?: ReactNode
  footer?: ReactNode
}

// One tier in its material (DESIGN §4.5): price a month, credits, price per credit, and the
// yearly saving only on Yearly; then its perks.
export function TierCard({ offer, period, perks, selected, density = "full", check, footer }: Props) {
  const t = useTranslations("paywall")
  const money = useMoney()
  const flag = FLAGS[offer.tier]
  const compact = density === "compact"
  return (
    <span className={cn("tier-card block px-4", compact ? "py-3" : "py-3.5")} data-tier={offer.tier} data-selected={selected}>
      <span className="flex items-start justify-between gap-2.5">
        <span className="text-headline leading-none font-semibold tracking-[-0.015em] text-[var(--tier-ink)]">
          {t(`tiers.${offer.tier}`)}
          {flag ? (
            <span className="ml-2 inline-flex h-6 items-center rounded-full [background:var(--tier-flag)] px-2 align-[2px] text-caption font-semibold text-[var(--tier-flag-ink)]">
              {t(flag)}
            </span>
          ) : null}
        </span>
        {check}
      </span>
      <span className={cn("flex items-baseline gap-1.5", compact ? "mt-1.5" : "mt-2.5")}>
        {t.rich("perMonth", {
          price: money(perMonthUsd(offer, period)),
          amt: (chunks) => (
            <span className={cn("font-display leading-[.9] tracking-[-0.02em] text-[var(--tier-ink)]", compact ? "text-[32px]" : "text-[40px]")}>{chunks}</span>
          ),
          per: (chunks) => <span className="text-caption text-muted-foreground">{chunks}</span>,
        })}
        {period === "year" ? (
          <s className="ml-1 font-mono text-caption text-muted-foreground" aria-label={t("wasMonthly", { price: money(offer.monthly.priceUsd) })}>
            {money(offer.monthly.priceUsd)}
          </s>
        ) : null}
      </span>
      {compact ? <CompactFacts offer={offer} period={period} /> : <TierFacts offer={offer} period={period} />}
      {perks ? <PerkList perks={perks} /> : null}
      {footer}
    </span>
  )
}

// Credits, price per credit, and on Yearly the saving on its own plate.
function TierFacts({ offer, period }: { offer: TierOffer; period: Period }) {
  const t = useTranslations("paywall")
  const money = useMoney()
  const product = productFor(offer, period)
  return (
    <>
      <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-caption text-bone-dim">
        <span>{period === "year" ? t("creditsYear", { count: product.credits, price: money(product.priceUsd) }) : t("creditsMonth", { count: product.credits })}</span>
        <span className="font-mono text-muted-foreground">{t("perCredit", { price: money(perCreditUsd(product)) })}</span>
      </span>
      {period === "year" ? (
        <span className="mt-2.5 block rounded-[11px] bg-[var(--tier-plate)] px-3 py-2 text-caption">
          {t.rich("saving", { amount: money(yearlySavingUsd(offer)), b: (chunks) => <b className="font-mono font-semibold">{chunks}</b> })}
        </span>
      ) : null}
    </>
  )
}

// One line: credits, then the yearly saving or (monthly) the price per credit.
function CompactFacts({ offer, period }: { offer: TierOffer; period: Period }) {
  const t = useTranslations("paywall")
  const money = useMoney()
  const product = productFor(offer, period)
  return (
    <span className="mt-1.5 block text-caption text-bone-dim">
      {period === "year"
        ? t.rich("compactYear", {
            count: product.credits,
            amount: money(yearlySavingUsd(offer)),
            b: (chunks) => <b className="font-mono font-semibold text-[var(--tier-ink)]">{chunks}</b>,
          })
        : t("compactMonth", { count: product.credits, price: money(perCreditUsd(product)) })}
    </span>
  )
}

function Tick() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="mt-0.5 size-[15px] flex-none text-[var(--tier-ink)]" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

// Live perks as ticks; Coming soon apart in muted type, never mixed in (DESIGN §4.5).
function PerkList({ perks }: { perks: TierPerks }) {
  const t = useTranslations("paywall")
  return (
    <span className="mt-3 grid gap-1.5 border-t border-hairline pt-3">
      <span className="text-caption font-semibold text-muted-foreground">{t(`perkHeadings.${perks.heading}`)}</span>
      {perks.live.map((perk) => (
        <span key={perk.key} className="flex items-start gap-2 text-caption leading-[1.35] text-[var(--tier-perk)]">
          <Tick />
          {t(`perks.${perk.key}`, perk.values)}
        </span>
      ))}
      {perks.soon.length > 0 ? (
        <span className="mt-1 text-caption leading-[1.35] text-muted-foreground">
          {t.rich("comingSoonList", {
            items: perks.soon.map((perk) => t(`perks.${perk.key}`, perk.values)).join(" · "),
            b: (chunks) => <span className="font-semibold">{chunks}</span>,
          })}
        </span>
      ) : null}
    </span>
  )
}

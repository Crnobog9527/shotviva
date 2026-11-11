"use client"

/* eslint-disable @next/next/no-img-element -- three small static case images */
import { useTranslations } from "next-intl"

import type { PackProduct } from "../../config"
import { cn } from "../../ui/cn"
import { compareForNeed, type CreditCompare } from "./credit-compare"
import type { TierOffer } from "./offer"
import type { PaywallChoice, PaywallMoment, PaywallPick } from "./use-paywall-state"
import { useMoney } from "./use-money"

type Props = {
  moment?: PaywallMoment
  needed?: number
  offers: TierOffer[]
  packs: PackProduct[]
  pick: PaywallPick
  onPick(patch: Partial<PaywallChoice>): void
}

// What the paywall shows above the plans for the limit the user just met (T107): a batch
// example when they picked more photos or templates than their plan runs, the pack-or-plan
// comparison when credits ran out. Nothing for the other ways in.
export function PaywallMoment({ moment, needed = 0, offers, packs, pick, onPick }: Props) {
  if (moment === "photos" || moment === "templates") return <BatchExample />
  if (moment !== "credits") return null
  const compare = compareForNeed(needed, packs, offers)
  return compare ? <PackOrPlan compare={compare} needed={needed} pick={pick} onPick={onPick} /> : null
}

// One phone photo and two of its results from the same batch, real outputs from /cases. The
// disclosure is the caption, never a badge on the image (DESIGN, The No Badge Rule).
const EXAMPLE = ["/cases/pet-phone.webp", "/cases/pet-3d.webp", "/cases/pet-anime.webp"] as const

function BatchExample() {
  const t = useTranslations("paywall.example")
  return (
    <figure className="mt-5 mb-5">
      <div className="grid grid-cols-[1fr_auto_1fr_1fr] items-center gap-2">
        <img src={EXAMPLE[0]} alt={t("photoAlt")} loading="lazy" decoding="async" className="hairline aspect-[4/5] w-full rounded-[12px] object-cover" />
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 text-primary" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
        {EXAMPLE.slice(1).map((src, index) => (
          <img key={src} src={src} alt={t("resultAlt", { index: index + 1 })} loading="lazy" decoding="async" className="hairline aspect-[4/5] w-full rounded-[12px] object-cover" />
        ))}
      </div>
      <figcaption className="mt-2 text-caption leading-[1.4] text-muted-foreground">{t("caption")}</figcaption>
    </figure>
  )
}

type CompareProps = { compare: CreditCompare; needed: number; pick: PaywallPick; onPick(patch: Partial<PaywallChoice>): void }

// Both options with what they give and cost, and a plain verdict; either row picks that product
// below (the buyer decides, nothing is pre-ticked for them here).
function PackOrPlan({ compare, needed, pick, onPick }: CompareProps) {
  const t = useTranslations("paywall")
  const money = useMoney()
  const { pack, plan } = compare
  const tier = t(`tiers.${plan.tier}`)
  const rows = [
    { key: "pack", on: pick === pack.id, title: t("packOrPlan.packTitle", { count: pack.credits }), price: t("packOrPlan.packPrice", { price: money(pack.priceUsd, true) }), pick: { pick: pack.id } },
    { key: "plan", on: pick === plan.tier, title: t("packOrPlan.planTitle", { tier, count: plan.credits }), price: t("packOrPlan.planPrice", { price: money(plan.priceUsd, true) }), pick: { pick: plan.tier, period: "month" as const } },
  ]
  return (
    <section aria-labelledby="pw-compare-h" className="mt-5 mb-5">
      <h3 id="pw-compare-h" className="text-headline font-semibold">{t("packOrPlan.title", { count: needed })}</h3>
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        {rows.map((row) => (
          <button key={row.key} type="button" aria-pressed={row.on} onClick={() => onPick(row.pick)} className={cn("press grid min-h-16 gap-1 rounded-control bg-[var(--tier-graphite)] px-4 py-3 text-left", row.on ? "shadow-[inset_0_0_0_1.5px_var(--foreground)]" : "hairline")}>
            <b className="text-body leading-[1.25] font-semibold">{row.title}</b>
            <span className="font-mono text-caption text-bone-dim">{row.price}</span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-caption leading-[1.45] text-bone-dim">{t(`packOrPlan.verdict.${verdictKey(compare)}`, { tier })}</p>
    </section>
  )
}

function verdictKey({ cheaperToday, cheaperPerCredit }: CreditCompare) {
  if (cheaperToday === "same" && cheaperPerCredit === "same") return "same"
  if (cheaperToday === cheaperPerCredit) return cheaperToday
  return cheaperToday === "pack" ? "packNowPlanLater" : "planNowPackLater"
}

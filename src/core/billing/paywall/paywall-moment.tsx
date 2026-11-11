"use client"

/* eslint-disable @next/next/no-img-element -- three small static case images */
import { useTranslations } from "next-intl"

import type { PackProduct } from "../../config"
import { cn } from "../../ui/cn"
import { compareForNeed, type CreditCompare } from "./credit-compare"
import type { TierOffer } from "./offer"
import type { PaywallChoice, PaywallMoment, PaywallPick } from "./use-paywall-state"
import { planStanding } from "./standing-pick"
import { useStanding } from "./standing-context"
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
  if (moment === "photos" || moment === "templates") return <BatchExample kind={moment} />
  if (moment !== "credits") return null
  return <CreditsMoment needed={needed} offers={offers} packs={packs} pick={pick} onPick={onPick} />
}

// Only plans this member can buy on the monthly row the comparison picks (never their own or a
// lower plan); a member already at the top sees the pack alone.
function CreditsMoment({ needed, offers, packs, pick, onPick }: Omit<Props, "moment"> & { needed: number }) {
  const standing = useStanding()
  const compare = compareForNeed(needed, packs, offers, (tier) => planStanding(standing, tier, "month").lock === null)
  return compare ? <PackOrPlan compare={compare} needed={needed} pick={pick} onPick={onPick} /> : null
}

// Real outputs from /cases; the disclosure is the caption, never a badge on the image (DESIGN,
// The No Badge Rule). More photos (Pro) is one template, so its example is one photo and the
// one result that template made; more templates (Max) is one photo and two results.
const EXAMPLES = {
  photos: ["/cases/sneaker-phone.webp", "/cases/sneaker-listing.webp"],
  templates: ["/cases/pet-phone.webp", "/cases/pet-3d.webp", "/cases/pet-anime.webp"],
} as const

function BatchExample({ kind }: { kind: keyof typeof EXAMPLES }) {
  const t = useTranslations("paywall.example")
  const [photo, ...results] = EXAMPLES[kind]
  return (
    <figure className="mt-5 mb-5">
      <div className={cn("grid items-center gap-2", results.length > 1 ? "grid-cols-[1fr_auto_1fr_1fr]" : "max-w-[360px] grid-cols-[1fr_auto_1fr]")}>
        <img src={photo} alt={t("photoAlt")} loading="lazy" decoding="async" className="hairline aspect-[4/5] w-full rounded-[12px] object-cover" />
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 text-primary" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
        {results.map((src, index) => (
          <img key={src} src={src} alt={t("resultAlt", { index: index + 1 })} loading="lazy" decoding="async" className="hairline aspect-[4/5] w-full rounded-[12px] object-cover" />
        ))}
      </div>
      <figcaption className="mt-2 text-caption leading-[1.4] text-muted-foreground">{t(`caption.${kind}`)}</figcaption>
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
  const tier = plan ? t(`tiers.${plan.tier}`) : ""
  const rows: { key: string; on: boolean; title: string; price: string; pick: Partial<PaywallChoice> }[] = [
    { key: "pack", on: pick === pack.id, title: t("packOrPlan.packTitle", { count: pack.credits }), price: t("packOrPlan.packPrice", { price: money(pack.priceUsd, true) }), pick: { pick: pack.id } },
  ]
  if (plan) rows.push({ key: "plan", on: pick === plan.tier, title: t("packOrPlan.planTitle", { tier, count: plan.credits }), price: t("packOrPlan.planPrice", { price: money(plan.priceUsd, true) }), pick: { pick: plan.tier, period: "month" } })
  return (
    <section aria-labelledby="pw-compare-h" className="mt-5 mb-5">
      <h3 id="pw-compare-h" className="text-headline font-semibold">{t(plan ? "packOrPlan.title" : "packOrPlan.packOnlyTitle", { count: needed })}</h3>
      <div className={cn("mt-2 grid gap-2", rows.length > 1 && "md:grid-cols-2")}>
        {rows.map((row) => (
          <button key={row.key} type="button" aria-pressed={row.on} onClick={() => onPick(row.pick)} className={cn("press grid min-h-16 gap-1 rounded-control bg-[var(--tier-graphite)] px-4 py-3 text-left", row.on ? "shadow-[inset_0_0_0_1.5px_var(--foreground)]" : "hairline")}>
            <b className="text-body leading-[1.25] font-semibold">{row.title}</b>
            <span className="font-mono text-caption text-bone-dim">{row.price}</span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-caption leading-[1.45] text-bone-dim">{compare.plan ? t(`packOrPlan.verdict.${verdictKey(compare)}`, { tier }) : t("packOrPlan.packOnly")}</p>
    </section>
  )
}

function verdictKey({ cheaperToday, cheaperPerCredit }: Extract<CreditCompare, { cheaperToday: unknown }>) {
  if (cheaperToday === "same" && cheaperPerCredit === "same") return "same"
  if (cheaperToday === cheaperPerCredit) return cheaperToday
  return cheaperToday === "pack" ? "packNowPlanLater" : "planNowPackLater"
}

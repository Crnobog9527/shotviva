"use client"

import { useTranslations } from "next-intl"

import { pricingV2 } from '../../public-env'
import type { PackProduct } from "../../config"
import { cn } from "../../ui/cn"
import { packLooks, productFor, type TierOffer } from "./offer"
import { resolvePick } from "./pick"
import { PackCard } from "./pack-card"
import { PhotoEstimateNote } from "./photo-estimate-line"
import { useStanding } from "./standing-context"
import { planStanding } from "./standing-pick"
import { TierCard } from "./tier-card"
import type { PaywallState } from "./use-paywall-state"

// The tiers and the packs are one choice: both radiogroups share the input name, so picking a
// pack clears the tier and the other way round (comps-v3-b paywall.html).
const PICK = "paywall-pick"
const focusRing = "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-ring"

type TierProps = { offers: TierOffer[]; state: PaywallState }

// A member's lower and current plans stay visible but cannot be picked (T66); the checkout bar
// explains a locked pick left over from switching Monthly / Yearly. The photo estimate's one
// footnote sits under the three cards.
export function TierPicker({ offers, state }: TierProps) {
  return (
    <>
      <TierRadios offers={offers} state={state} />
      <PhotoEstimateNote className="mt-2 px-0.5" />
    </>
  )
}

function TierRadios({ offers, state }: TierProps) {
  const t = useTranslations("paywall")
  const standing = useStanding()
  const { choice, update } = state
  const pickedId = resolvePick(choice.pick, choice.period, offers, [])?.product.id
  return (
    // From md the cards are about 280px wide: the saving reads just "You save".
    <div role="radiogroup" aria-label={t("plansLabel")} className="mt-4 grid gap-2 md:mt-6 md:grid-cols-3 md:gap-3 md:[&_.tier-saving-vs]:hidden">
      {offers.map((offer) => {
        const id = productFor(offer, choice.period).id
        const selected = pickedId === id
        const { lock } = planStanding(standing, offer.tier, choice.period, id)
        return (
          <label key={id} data-tier={offer.tier} className={cn("tier-shell", lock ? "cursor-default" : "cursor-pointer", focusRing)}>
            <input
              type="radio"
              name={PICK}
              value={id}
              checked={selected}
              disabled={lock !== null}
              onChange={() => update({ pick: id })}
              className="sr-only"
            />
            <TierCard
              offer={offer}
              singlePayment={choice.method === "alipay"}
              period={choice.period}
              selected={selected}
              check={lock ? null : <Check on={selected} />}
              lock={lock}
            />
          </label>
        )
      })}
    </div>
  )
}

export function PackPicker({ packs, state }: { packs: PackProduct[]; state: PaywallState }) {
  const t = useTranslations("paywall")
  const { choice, update } = state
  const looks = packLooks(packs)
  return (
    <>
      <div className="mt-6 mb-2 flex flex-wrap items-baseline justify-between gap-x-3 px-0.5">
        <h3 className="text-headline font-semibold">{t("packsTitle")}</h3>
        <span className="text-caption text-muted-foreground">{t(pricingV2 ? "packsNoteV2" : "packsNote")}</span>
      </div>
      <div role="radiogroup" aria-label={t("packsLabel")} className="grid gap-2 md:grid-cols-3 md:gap-3">
        {packs.map((pack, i) => {
          const selected = choice.pick === pack.id
          const look = looks[i] ?? { tone: "graphite", flag: null }
          return (
            <label key={pack.id} className={cn("pack-shell block cursor-pointer rounded-control", focusRing)}>
              <input type="radio" name={PICK} value={pack.id} checked={selected} onChange={() => update({ pick: pack.id })} className="sr-only" />
              <PackCard pack={pack} look={look} selected={selected} />
            </label>
          )
        })}
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

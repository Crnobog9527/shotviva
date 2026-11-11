"use client"

import { useTranslations } from "next-intl"

import { trackPaywallSelect } from "../../analytics/browser"

import type { MembershipTier, SiteProduct } from "../../config"
import { MAX_BATCH_TEMPLATES } from "../../jobs/batch/limits"
import { limitsFor } from "../tier-limits"
import { ResponsiveSheet } from "../../ui/responsive-sheet"
import { usePushBack } from "../../ui/use-push-back"
import { DiscountProvider } from "./discount-context"
import { DiscountBanner, DiscountEntry } from "./discount-controls"
import { BillingToggle } from "./billing-toggle"
import { packOffers, tierOffers, yearlySavingPct } from "./offer"
import { PayMethods } from "./pay-methods"
import { PaywallMoment as MomentLead } from "./paywall-moment"
import { PaywallCheckout } from "./paywall-checkout"
import type { PaywallTrigger } from "./paywall-context"
import { PackPicker, TierPicker } from "./paywall-pickers"
import { resolvePick, selectedProduct } from "./pick"
import type { PaywallChoice, PaywallMoment, PaywallState } from "./use-paywall-state"

type Props = {
  open: boolean
  onOpenChange(open: boolean): void
  trigger: PaywallTrigger
  // The limit the user just met (T107): the lead line and what shows above the plans.
  moment?: PaywallMoment
  needed?: number
  // The plan the sheet opened on for that moment, which the batch lead line describes.
  momentTier?: MembershipTier
  products: readonly SiteProduct[]
  state: PaywallState
}

// The paywall (comps-v3-b paywall.html, signed off 2026-11-06): one screen, a full-height
// bottom drawer on phones and a centred 920px dialog from md (ResponsiveSheet `wide`). Monthly /
// Yearly beside the title; the three tiers; the three packs; the payment method; and the
// checkout bar fixed at the bottom, which goes to the hosted checkout (Stripe or Waffo).
export function PaywallSheet(props: Props) {
  return <DiscountProvider active={props.open}><SheetBody {...props} /></DiscountProvider>
}

function SheetBody({ open, onOpenChange, trigger, moment, needed, momentTier, products, state }: Props) {
  const t = useTranslations("paywall")
  const offers = tierOffers(products)
  const packs = packOffers(products)
  const { choice, update } = state
  const resolved = resolvePick(choice.pick, choice.period, offers, packs)
  // The buyer's own picks count as paywall_select (T74); the preselected opening does not.
  const select = (patch: Partial<PaywallChoice>) => {
    update(patch)
    const picked = selectedProduct(choice, patch, offers, packs)
    if (picked) trackPaywallSelect(picked)
  }
  const picking = { ...state, update: select }
  // The page behind steps back on phones and dims on desktop (paywall.html .behind).
  usePushBack(open)
  return (
    <ResponsiveSheet
      wide
      open={open}
      onOpenChange={onOpenChange}
      title={t("title")}
      description={leadLine(trigger, moment, momentTier, t)}
      aside={
        <BillingToggle
          period={choice.period}
          onChange={(period) => select({ period })}
          savePct={yearlySavingPct(offers)}
          className="mt-4 md:mt-1 md:w-[400px] md:flex-none"
        />
      }
      footer={resolved ? <PaywallCheckout resolved={resolved} choice={choice} /> : null}
    >
      <DiscountBanner singlePayment={choice.method === "alipay"} />
      <MomentLead moment={moment} needed={needed} offers={offers} packs={packs} pick={choice.pick} onPick={select} />
      <TierPicker offers={offers.filter(o => choice.period === "year" ? o.yearly : o.monthly)} state={picking} />
      <PackPicker packs={packs} state={picking} />
      <PayMethods method={choice.method} onChange={(method) => update({ method })} kind={resolved?.kind ?? "plan"} period={choice.period} />
      <DiscountEntry />
    </ResponsiveSheet>
  )
}

// Under the title: what just happened, in one line. The batch moments name the plan's own limits
// (TIER_LIMITS), so the line says what the code allows.
function leadLine(trigger: PaywallTrigger, moment: PaywallMoment | undefined, tier: MembershipTier | undefined, t: ReturnType<typeof useTranslations<"paywall">>) {
  if (moment === "watermark") return t("moments.watermark")
  if (moment === "photos") {
    const target = tier ?? "pro"
    return t("moments.photos", { tier: t(`tiers.${target}`), count: limitsFor(target).batchMax })
  }
  if (moment === "templates") return t("moments.templates", { templates: MAX_BATCH_TEMPLATES, count: limitsFor("max").batchMax })
  return t(trigger === "insufficient_credits" ? "introNeedsCredits" : "intro")
}

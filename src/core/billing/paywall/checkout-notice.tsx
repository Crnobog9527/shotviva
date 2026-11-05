"use client"

import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"

import { pricingReturnTarget } from "../../partner/return-to"

// Shown on the success page (/account?checkout=success, set by core/billing/stripe/checkout).
// Credits arrive through the webhook, usually before the redirect lands, so this only says
// thanks; a Graylum top-up also gets its way back (ARCHITECTURE §14.5).
export function CheckoutNotice({ returnToHosts }: { returnToHosts: readonly string[] }) {
  const t = useTranslations("paywall")
  const params = useSearchParams()
  if (params.get("checkout") !== "success") return null
  const back = pricingReturnTarget({ from: params.get("from"), return_to: params.get("return_to") }, { returnToHosts })
  return (
    <div role="status" className="hairline-lit mx-4 mt-4 rounded-panel bg-success-tint p-4 text-body">
      <p>{t("thanks")}</p>
      {back ? (
        <a href={back} className="mt-1 inline-flex min-h-11 items-center gap-1 font-medium">
          {t("backToPartner")}
          <span aria-hidden="true" className="text-primary">→</span>
        </a>
      ) : null}
    </div>
  )
}

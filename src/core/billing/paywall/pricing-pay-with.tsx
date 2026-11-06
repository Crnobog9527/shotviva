import { useTranslations } from "next-intl"

import type { PaymentChannel } from "../../config"
import { CHECKOUT_METHODS } from "../stripe/catalog"
import { methodLabel, pricingMethodNote } from "./copy"
import { MethodMark } from "./pay-methods"

// /pricing's "Pay with" (comps-v3-b pricing.html): the two payment groups as plain rows, not
// choices; the method is picked in the paywall. Renders on the server, so the payment terms
// are in the static HTML, worded for the live channel.
export function PricingPayWith({ channel }: { channel: PaymentChannel }) {
  const t = useTranslations("paywall")
  return (
    <section aria-labelledby="pay-with-h" className="grid gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 px-0.5">
        <h2 id="pay-with-h" className="text-headline font-semibold">
          {t("payWith")}
        </h2>
        <span className="text-caption text-muted-foreground">{t("pricesInUsd")}</span>
      </div>
      <ul className="grid gap-2">
        {CHECKOUT_METHODS.map((method) => {
          const label = methodLabel(channel, method)
          const note = pricingMethodNote(channel, method)
          return (
            <li key={method} className="flex min-h-14 items-center gap-3 rounded-control bg-[var(--tier-graphite)] px-3 py-2 shadow-[inset_0_0_0_1px_var(--border)]">
              <span className="flex-1 text-body leading-tight font-medium">
                {t(label.key, label.values)}
                <small className="mt-0.5 block text-caption font-normal text-muted-foreground">{t(note.key, note.values)}</small>
              </span>
              <MethodMark method={method} />
            </li>
          )
        })}
      </ul>
    </section>
  )
}

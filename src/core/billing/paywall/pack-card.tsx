"use client"

import { useTranslations } from "next-intl"
import type { ReactNode } from "react"

import type { PackProduct } from "../../config"
import { perCreditUsd, type PackLook } from "./offer"
import { useProductDiscount } from "./discount-context"
import { useMoney } from "./use-money"

type Props = { pack: PackProduct; look: PackLook; selected?: boolean; action?: ReactNode }

// One credit pack in its material (comps-v3-b tiers.css): credits, price, price per credit,
// and on /pricing a "Buy" button. A row on phones, a column from md up (tiers.css).
export function PackCard({ pack, look, selected = false, action }: Props) {
  const t = useTranslations("paywall")
  const money = useMoney()
  const discount = useProductDiscount(pack)
  const effective = discount ? { ...pack, priceUsd: discount.priceUsd } : pack
  return (
    <span className="pack-card" data-tone={look.tone === "graphite" ? undefined : look.tone} data-selected={selected}>
      {look.flag ? (
        <span className="pack-flag inline-flex h-6 items-center rounded-full [background:var(--tier-flag)] px-2 text-caption leading-none font-semibold text-[var(--tier-flag-ink)]">
          {t(look.flag)}
        </span>
      ) : null}
      <span className="pack-cr leading-none">
        {t.rich("packCredits", {
          count: pack.credits,
          n: (chunks) => <span className="font-display text-[40px] leading-[.9] tracking-[-0.02em]">{chunks}</span>,
          u: (chunks) => <span className="ml-1.5 text-caption text-muted-foreground">{chunks}</span>,
        })}
      </span>
      <span className="pack-usd text-body leading-none font-semibold">
        {discount && <s className="mr-1.5 text-caption font-normal text-muted-foreground">{money(pack.priceUsd)}</s>}
        {money(effective.priceUsd)}
        {discount && <small className="mt-1 block text-caption font-normal text-bone-dim">{t("codeOnce")}</small>}
      </span>
      <span className="pack-each font-mono text-caption leading-none font-medium">{t("perCreditShort", { price: money(perCreditUsd(effective)) })}</span>
      {action ? <span className="pack-act block">{action}</span> : null}
    </span>
  )
}

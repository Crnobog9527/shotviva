"use client"

import { useFormatter, useLocale, useTranslations } from "next-intl"

import { pricingV2 } from "../../public-env"
import { offerLabel, productFor, type Period, type TierOffer } from "./offer"
import { usePerkFacts } from "./perk-facts"
import { Tick } from "./perk-list"
import { PhotoEstimateNote, useRangeText } from "./photo-estimate-line"
import { compareRows, type CompareCell } from "./plan-compare-rows"

// Below the three plans on /pricing: the same rows as the cards, side by side, closed by
// default. A native <details>, so it works before hydration and every row is in the HTML
// (建站规格 R5). Four narrow columns fit a 375px phone without scrolling sideways.
export function PlanCompare({ offers, period }: { offers: readonly TierOffer[]; period: Period }) {
  const t = useTranslations("paywall")
  const locale = useLocale()
  const products = offers.map(o => productFor(o, period))
  const facts = usePerkFacts()
  const rows = compareRows(offers, { ...facts, memberPacks: pricingV2 }, period)
  return (
    <details className="group hairline-lit mt-4 rounded-media bg-card md:mt-6">
      <summary className="press flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 text-label font-semibold [&::-webkit-details-marker]:hidden">
        {t("compare.title")}
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 flex-none text-bone-dim transition-transform duration-200 group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>
      <div className="overflow-x-auto px-3 pb-3 md:px-4 md:pb-4">
        <table className="w-full table-fixed border-collapse text-caption" style={offers.length > 3 ? { minWidth: offers.length * 130 + 200 } : undefined}>
          <caption className="sr-only">{t("compare.title")}</caption>
          <thead>
            <tr>
              <td className="w-[40%] md:w-[46%]" />
              {products.map((product) => (
                <th key={product.id} scope="col" className="pb-2 text-center font-semibold" data-tier={product.tier}>
                  {offerLabel(product, locale, t(`tiers.${product.tier}`))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="shadow-[inset_0_1px_0_var(--hairline)]">
                <th scope="row" className="py-2.5 pr-2 text-left leading-[1.3] font-normal text-bone-dim">
                  {t(`compare.rows.${row.key}`)}
                </th>
                {row.cells.map((cell, i) => (
                  <td key={products[i]?.id ?? i} className="py-2.5 text-center">
                    <Cell cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <PhotoEstimateNote className="mt-2 px-1" />
      </div>
    </details>
  )
}

function Cell({ cell }: { cell: CompareCell }) {
  const t = useTranslations("paywall.compare.cells")
  const format = useFormatter()
  const range = useRangeText()
  if (cell.format === "check") {
    return (
      <span className="inline-flex justify-center">
        <Tick className="text-foreground" />
        <span className="sr-only">{t("yes")}</span>
      </span>
    )
  }
  const text = cell.format === "range" ? range(cell.range) : cell.format === "count" ? format.number(cell.value) : t(cell.format, { value: cell.value })
  return <span className="font-mono">{text}</span>
}

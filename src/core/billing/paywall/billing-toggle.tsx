"use client"

import { useTranslations } from "next-intl"

import { cn } from "../../ui/cn"
import type { Period } from "./offer"

// Monthly / Yearly segmented control (DESIGN §4.5). The Yearly segment can carry the saving,
// computed from the config; step one and /pricing pass null on Monthly, where DESIGN wants no
// saving shown at all, and step two always shows it.
export function BillingToggle({ period, onChange, savePct }: { period: Period; onChange(period: Period): void; savePct: number | null }) {
  const t = useTranslations("paywall")
  const segments: { value: Period; label: string }[] = [
    { value: "month", label: t("monthly") },
    { value: "year", label: t("yearly") },
  ]
  return (
    <div role="group" aria-label={t("billingLabel")} className="hairline relative mt-4 mb-3 grid grid-cols-2 rounded-control bg-wash p-1">
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-inner bg-foreground transition-transform duration-400 ease-[var(--spring)]",
          period === "year" && "translate-x-full",
        )}
      />
      {segments.map((segment) => (
        <button
          key={segment.value}
          type="button"
          aria-pressed={period === segment.value}
          onClick={() => onChange(segment.value)}
          className={cn(
            "relative z-[1] inline-flex min-h-11 items-center justify-center gap-2 rounded-inner text-body font-semibold transition-colors",
            period === segment.value ? "text-background" : "text-bone-dim",
          )}
        >
          {segment.label}
          {segment.value === "year" && savePct !== null ? (
            <span className="rounded-[7px] bg-primary px-1.5 py-1 text-caption leading-none font-bold text-primary-foreground">
              {t("savePct", { pct: savePct })}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  )
}

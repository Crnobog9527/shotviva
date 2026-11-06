"use client"

import { useTranslations } from "next-intl"

import { cn } from "../../ui/cn"
import type { Period } from "./offer"

type Props = { period: Period; onChange(period: Period): void; savePct: number | null; className?: string }

// Monthly / Yearly segmented control (DESIGN §4.5, comps-v3-b tiers.css). The Yearly half
// always carries "Save up to 40%", the largest yearly saving computed from the config (DESIGN
// §6.9 item 6): tinted while Monthly is chosen, solid once Yearly is. The cards themselves show
// no saving on Monthly. On phones the Yearly half is wider so the badge fits.
export function BillingToggle({ period, onChange, savePct, className }: Props) {
  const t = useTranslations("paywall")
  const segments: { value: Period; label: string }[] = [
    { value: "month", label: t("monthly") },
    { value: "year", label: t("yearly") },
  ]
  const year = period === "year"
  return (
    <div
      role="group"
      aria-label={t("billingLabel")}
      className={cn("relative grid grid-cols-[42%_58%] rounded-control bg-wash p-1 shadow-[inset_0_0_0_1px_var(--border)] md:grid-cols-2", className)}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-1 rounded-inner bg-foreground transition-[left,width] duration-400 ease-[var(--spring)]",
          year ? "left-[42%] w-[calc(58%-4px)] md:left-1/2 md:w-[calc(50%-4px)]" : "left-1 w-[calc(42%-4px)] md:w-[calc(50%-4px)]",
        )}
      />
      {segments.map((segment) => {
        const pressed = period === segment.value
        return (
          <button
            key={segment.value}
            type="button"
            aria-pressed={pressed}
            onClick={() => onChange(segment.value)}
            className={cn(
              "relative z-[1] inline-flex min-h-11 items-center justify-center gap-1.5 rounded-inner px-1.5 text-label font-semibold whitespace-nowrap transition-colors md:gap-2 md:text-body",
              pressed ? "text-background" : "text-bone-dim hover:text-foreground",
            )}
          >
            {segment.label}
            {segment.value === "year" && savePct !== null ? <SaveBadge pct={savePct} solid={pressed} /> : null}
          </button>
        )
      })}
    </div>
  )
}

function SaveBadge({ pct, solid }: { pct: number; solid: boolean }) {
  const t = useTranslations("paywall")
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1 rounded-full px-[7px] text-caption leading-none font-medium tracking-[-0.01em] transition-colors",
        solid ? "bg-primary text-primary-foreground" : "bg-[color-mix(in_srgb,var(--primary)_16%,transparent)] text-primary",
      )}
    >
      {t.rich("savePct", { pct, b: (chunks) => <b className="font-mono font-medium">{chunks}</b> })}
    </span>
  )
}

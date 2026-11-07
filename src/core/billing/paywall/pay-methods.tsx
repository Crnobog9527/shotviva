"use client"

import { useLocale, useTranslations } from "next-intl"

import { cn } from "../../ui/cn"
import { offeredMethods, type CheckoutMethod } from "../stripe/catalog"
import { methodLabel, methodNote } from "./copy"
import type { Period } from "./offer"
import { usePaymentChannel } from "./channel-context"

type Props = { method: CheckoutMethod; onChange(method: CheckoutMethod): void; kind: "plan" | "pack"; period: Period }

// The payment groups (DESIGN §4.5): card with Apple Pay and Google Pay, and the wallets (支付宝 /
// 微信支付 on Stripe, T73; Alipay alone on Waffo); zh pages on Stripe lead with 中国银行卡
// (ARCHITECTURE §6.3, T64). For a plan a card renews and a wallet buys one period; for a pack
// all are one-time (copy.ts).
export function PayMethods({ method, onChange, kind, period }: Props) {
  const t = useTranslations("paywall")
  const channel = usePaymentChannel()
  const methods = offeredMethods(channel, useLocale())
  const label = (m: CheckoutMethod) => {
    const msg = methodLabel(channel, m)
    return t(msg.key, msg.values)
  }
  const note = (m: CheckoutMethod) => {
    const msg = methodNote(channel, { kind, method: m, period })
    return t(msg.key, msg.values)
  }
  return (
    <>
      <div className="mt-6 mb-2 flex items-baseline justify-between gap-3 px-0.5">
        <h3 className="text-headline font-semibold">{t("payWith")}</h3>
        <span className="text-caption text-muted-foreground">{t("pricesInUsd")}</span>
      </div>
      <div role="radiogroup" aria-label={t("payLabel")} className="grid gap-2 md:grid-cols-2">
        {methods.map((m) => (
          <label
            key={m}
            className={cn(
              // zh pages list three (T64): the last of an odd count spans the row, so the
              // overseas-card line keeps one line and no half-empty row is left.
              "flex min-h-14 cursor-pointer items-center gap-3 rounded-control bg-[var(--tier-graphite)] px-3 py-2 transition-shadow md:odd:last:col-span-2",
              method === m ? "shadow-[inset_0_0_0_1.5px_var(--bone-dim)]" : "shadow-[inset_0_0_0_1px_var(--border)] hover:shadow-[inset_0_0_0_1px_var(--input)]",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
            )}
          >
            <input
              type="radio"
              name="paywall-method"
              value={m}
              checked={method === m}
              onChange={() => onChange(m)}
              className="size-5 flex-none appearance-none rounded-full shadow-[inset_0_0_0_1.5px_var(--input)] checked:shadow-[inset_0_0_0_6px_var(--foreground)]"
            />
            <span className="flex-1 text-body leading-tight font-medium">
              {label(m)}
              <small className="mt-0.5 block text-caption font-normal text-muted-foreground">{note(m)}</small>
            </span>
            <MethodMark method={m} />
          </label>
        ))}
      </div>
    </>
  )
}

// Neutral marks only: no third-party logo files are bundled.
export function MethodMark({ method }: { method: CheckoutMethod }) {
  if (method !== "alipay") {
    return (
      <svg viewBox="0 0 28 20" aria-hidden="true" className="h-5 w-7 text-bone-dim" fill="none" stroke="currentColor">
        <rect x=".75" y=".75" width="26.5" height="18.5" rx="3.5" strokeWidth="1.5" />
        <path d="M1 6.5h26" strokeWidth="2.5" />
        <path d="M5 14h7" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 28 20" aria-hidden="true" className="h-5 w-7 text-bone-dim" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x=".75" y="2.75" width="26.5" height="16.5" rx="3.5" />
      <path d="M4 2.75l14-2 2 2" strokeLinejoin="round" />
      <rect x="18.75" y="8.25" width="8.5" height="5.5" rx="2" />
    </svg>
  )
}

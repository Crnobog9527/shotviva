"use client"

import { useLocale, useTranslations } from "next-intl"

import { cn } from "../../ui/cn"
import { offeredMethods, type CheckoutMethod } from "../stripe/catalog"
import { methodLabel, methodNote, wechatCapNote, type PaywallMessage } from "./copy"
import type { Period } from "./offer"
import { usePaymentChannel, useWechatPay } from "./channel-context"

type Props = { method: CheckoutMethod | null; onChange(method: CheckoutMethod): void; kind: "plan" | "pack"; period: Period; cents?: number | null; disabled?: boolean }

// The payment groups (DESIGN §4.5): card with Apple Pay and Google Pay, and the wallets (支付宝 /
// 微信支付 on Stripe while STRIPE_WECHAT_PAY is on, T73; otherwise Alipay alone); zh pages on Stripe lead with 中国银行卡
// (ARCHITECTURE §6.3, T64). For a plan a card renews and a wallet buys one period; for a pack
// all are one-time (copy.ts).
export function PayMethods({ method, onChange, kind, period, cents = null, disabled }: Props) {
  const t = useTranslations("paywall")
  const channel = usePaymentChannel()
  const wechatPay = useWechatPay()
  const methods = offeredMethods(channel, useLocale())
  const label = (m: CheckoutMethod) => {
    const msg = methodLabel(channel, m, wechatPay)
    return t(msg.key, msg.values)
  }
  const note = (m: CheckoutMethod) => {
    const msg = methodNote(channel, { kind, method: m, period })
    return t(msg.key, msg.values)
  }
  const cap = wechatCapNote(channel, wechatPay, cents)
  return (
    <>
    <div role="radiogroup" aria-label={t("payLabel")} className="mt-4 grid gap-2">
      {methods.map((m) => (
        <label
          key={m}
          className={cn(
            "flex min-h-14 cursor-pointer items-center gap-3 rounded-control bg-[var(--tier-graphite)] px-3 py-2 transition-shadow",
            method === m ? "shadow-[inset_0_0_0_1.5px_var(--bone-dim)]" : "shadow-[inset_0_0_0_1px_var(--border)] hover:shadow-[inset_0_0_0_1px_var(--input)]",
            "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
            "has-[:disabled]:cursor-default",
          )}
        >
          <input
            type="radio"
            name="paywall-method"
            value={m}
            checked={method === m}
            disabled={disabled}
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
    {cap && <WechatCap note={cap} text={t(cap.key)} />}
    </>
  )
}

// Waffo's WeChat Pay cap, before the buyer leaves for Waffo's page (copy.ts wechatCapNote).
export function WechatCap({ note, text }: { note: PaywallMessage & { over: boolean }; text: string }) {
  return (
    <p
      role="note"
      className={cn(
        "mt-3 text-caption",
        note.over
          ? "rounded-control px-3 py-2 font-medium text-foreground shadow-[inset_0_0_0_1px_var(--bone-dim)]"
          : "px-0.5 text-muted-foreground",
      )}
    >
      {text}
    </p>
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

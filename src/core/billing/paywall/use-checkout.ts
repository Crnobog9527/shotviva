"use client"

import { useRouter } from "next/navigation"
import { useLocale } from "next-intl"
import { useRef, useState } from "react"

import { useUpdateHold } from "../../app-update/holds"

import { pricingV2 } from "../../public-env"
import type { ProductId } from "../../config"
import { loginPath } from "../../auth/redirect-target"
import { localeOfPath, localizePath } from "../../i18n/paths"
import type { CheckoutMethod } from "../stripe/catalog"
import { refreshDiscount } from "./discount-context"

// "refused": the server refused a membership as the same plan or a lower one than the buyer
// holds (409 DOWNGRADE_NOT_ALLOWED, T66), say from a page opened before the plan changed; the
// paywall says plans only go up and points to Account.
export type CheckoutStatus = "idle" | "pending" | "error" | "refused" | "in_use" | "offer_changed" | "floor"

// The quote identifies what the tab displayed, including tabs opened before a catalogue switch.
export function displayedTerms(cents: number, version: "v1" | "v2") {
  return { pricing_version: version, expected_price_cents: version === "v2" ? cents : undefined }
}

function displayedQuote(cents: number, revision: number | undefined) {
  return { ...displayedTerms(cents, pricingV2 ? "v2" : "v1"), expected_revision: pricingV2 ? revision : undefined }
}

// Asks the server for a Stripe Checkout Session and goes there. Signed-out buyers (the public
// /pricing page) go to sign-in first and come back to the same page.
export function useCheckout() {
  const locale = useLocale()
  const router = useRouter()
  const lastAttempt = useRef<CheckoutAttempt | null>(null)
  const [status, setStatus] = useState<CheckoutStatus>("idle")
  // No new-version banner while the buyer is on the way to the hosted checkout (T90).
  useUpdateHold("checkout", status === "pending")

  async function start(productId: ProductId, method: CheckoutMethod, displayedCents: number, expectedCode?: string, revision?: number) {
    setStatus("pending")
    const body = JSON.stringify({ product_id: productId, method, locale: locale.startsWith("zh") ? "zh" : "en", expected_code: expectedCode, ...displayedQuote(displayedCents, revision), ...partnerReturn() })
    const attempt = checkoutAttempt(body, lastAttempt.current)
    lastAttempt.current = attempt
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": attempt.id }, body,
      })
      // Network/5xx and unreadable success replies can hide a created session. Retry the
      // same purchase with the same key. A definitive client error starts a fresh attempt.
      if (response.status >= 400 && response.status < 500 && lastAttempt.current === attempt) lastAttempt.current = null
      if (response.status === 401) {
        // The login page of the page's own language; `next` is the address as it stands.
        const here = `${window.location.pathname}${window.location.search}`
        window.location.assign(localizePath(loginPath(here), localeOfPath(window.location.pathname)))
        return
      }
      const answer = readAnswer(response.status, await response.json().catch(() => null))
      if (answer.kind === "offer_changed") {
        refreshDiscount()
        router.refresh()
      }
      if (answer.kind !== "url") setStatus(answer.kind)
      else window.location.assign(answer.url)
    } catch {
      setStatus("error")
    }
  }

  return { status, start }
}

type CheckoutAttempt = { body: string; id: string; created: number }

export function checkoutAttempt(body: string, previous: CheckoutAttempt | null, now = Date.now()): CheckoutAttempt {
  if (previous?.body === body && now - previous.created < 30 * 60_000) return previous
  return { body, id: crypto.randomUUID(), created: now }
}

type Answer = { kind: "url"; url: string } | { kind: "refused" | "in_use" | "offer_changed" | "floor" }

// The checkout URL, or 409 DOWNGRADE_NOT_ALLOWED (only upgrades while a membership runs);
// anything else throws and shows the generic error.
export function readAnswer(status: number, body: unknown): Answer {
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {}
  if (status === 409 && typeof record.code === "string") {
    const kind = conflicts.get(record.code)
    if (kind) return { kind }
  }
  if (status < 200 || status >= 300 || typeof record.url !== "string") throw new Error("no checkout url")
  return { kind: "url", url: record.url }
}

const conflicts = new Map<string, "refused" | "in_use" | "offer_changed" | "floor">([
  ["CODE_CHECKOUT_IN_PROGRESS", "in_use"], ["CODE_CHECKOUT_OFFER_CHANGED", "offer_changed"],
  ["DOWNGRADE_NOT_ALLOWED", "refused"], ["CODE_CHECKOUT_FLOOR", "floor"],
])

// A Graylum top-up arrives as /pricing?from=graylum&return_to=…; the server checks the host.
function partnerReturn(): { return_to?: string } {
  const params = new URLSearchParams(window.location.search)
  const returnTo = params.get("return_to")
  return params.get("from") === "graylum" && returnTo ? { return_to: returnTo } : {}
}

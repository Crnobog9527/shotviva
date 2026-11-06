"use client"

import { useLocale } from "next-intl"
import { useState } from "react"

import type { ProductId } from "../../config"
import { loginPath } from "../../auth/redirect-target"
import { localeOfPath, localizePath } from "../../i18n/paths"
import type { CheckoutMethod } from "../stripe/catalog"

// "subscribed": the server refused a membership because a subscription is already running
// (409 SUBSCRIPTION_EXISTS, one per account); the paywall points to Account instead.
export type CheckoutStatus = "idle" | "pending" | "error" | "subscribed"

// Asks the server for a Stripe Checkout Session and goes there. Signed-out buyers (the public
// /pricing page) go to sign-in first and come back to the same page.
export function useCheckout() {
  const locale = useLocale()
  const [status, setStatus] = useState<CheckoutStatus>("idle")

  async function start(productId: ProductId, method: CheckoutMethod) {
    setStatus("pending")
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ product_id: productId, method, locale: locale.startsWith("zh") ? "zh" : "en", ...partnerReturn() }),
      })
      if (response.status === 401) {
        // The login page of the page's own language; `next` is the address as it stands.
        const here = `${window.location.pathname}${window.location.search}`
        window.location.assign(localizePath(loginPath(here), localeOfPath(window.location.pathname)))
        return
      }
      const answer = readAnswer(response.status, await response.json().catch(() => null))
      if (answer.kind === "subscribed") setStatus("subscribed")
      else window.location.assign(answer.url)
    } catch {
      setStatus("error")
    }
  }

  return { status, start }
}

type Answer = { kind: "url"; url: string } | { kind: "subscribed" }

// The checkout URL, or 409 SUBSCRIPTION_EXISTS (one running subscription per account); anything
// else throws and shows the generic error.
export function readAnswer(status: number, body: unknown): Answer {
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {}
  if (status === 409 && record.code === "SUBSCRIPTION_EXISTS") return { kind: "subscribed" }
  if (status < 200 || status >= 300 || typeof record.url !== "string") throw new Error("no checkout url")
  return { kind: "url", url: record.url }
}

// A Graylum top-up arrives as /pricing?from=graylum&return_to=…; the server checks the host.
function partnerReturn(): { return_to?: string } {
  const params = new URLSearchParams(window.location.search)
  const returnTo = params.get("return_to")
  return params.get("from") === "graylum" && returnTo ? { return_to: returnTo } : {}
}

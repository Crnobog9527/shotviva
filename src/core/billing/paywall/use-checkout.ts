"use client"

import { useLocale } from "next-intl"
import { useState } from "react"

import type { ProductId } from "../../config"
import { loginPath } from "../../auth/redirect-target"
import type { CheckoutMethod } from "../stripe/catalog"

export type CheckoutStatus = "idle" | "pending" | "error"

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
        window.location.assign(loginPath(`${window.location.pathname}${window.location.search}`))
        return
      }
      const body: unknown = await response.json().catch(() => null)
      const url = typeof body === "object" && body !== null && "url" in body ? body.url : null
      if (!response.ok || typeof url !== "string") throw new Error("no checkout url")
      window.location.assign(url)
    } catch {
      setStatus("error")
    }
  }

  return { status, start }
}

// A Graylum top-up arrives as /pricing?from=graylum&return_to=…; the server checks the host.
function partnerReturn(): { return_to?: string } {
  const params = new URLSearchParams(window.location.search)
  const returnTo = params.get("return_to")
  return params.get("from") === "graylum" && returnTo ? { return_to: returnTo } : {}
}

"use client"

import type { ComponentProps } from "react"

import { usePaywall, type PaywallTrigger } from "./paywall-context"
import type { PaywallOpenOptions } from "./use-paywall-state"

type Props = Omit<ComponentProps<"button">, "onClick" | "type"> & { trigger: PaywallTrigger; options?: PaywallOpenOptions }

// Any element that opens the paywall: "Get credits", the balance chip, a plan on /pricing.
export function PaywallButton({ trigger, options, ...props }: Props) {
  const paywall = usePaywall()
  return <button type="button" onClick={() => paywall.open(trigger, options)} {...props} />
}

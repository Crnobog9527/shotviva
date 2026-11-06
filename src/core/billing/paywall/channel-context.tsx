"use client"

import { createContext, useContext } from "react"

import type { PaymentChannel } from "../../config"

// The server's PAYMENT_CHANNEL, handed down by PaywallProvider: it decides the payment copy
// (copy.ts). Its own context so the steps read it without importing the provider.
export const PaymentChannelContext = createContext<PaymentChannel>("stripe")

export function usePaymentChannel(): PaymentChannel {
  return useContext(PaymentChannelContext)
}

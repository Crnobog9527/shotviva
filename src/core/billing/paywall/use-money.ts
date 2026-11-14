"use client"

import { useFormatter } from "next-intl"

import { usdFormat } from "./offer"

// "$19.90", "$191": prices in USD in every language, formatted by next-intl (ARCHITECTURE §17).
export function useMoney(): (amount: number, showCents?: boolean) => string {
  const format = useFormatter()
  return (amount, showCents) => format.number(amount, usdFormat(amount, showCents))
}

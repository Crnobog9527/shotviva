'use client'

import { useTranslations } from 'next-intl'

import { usePaywall } from '@/core/billing/paywall/provider'

import type { PreflightError } from './preflight'

const PAYWALL_CODES = new Set(['TIER_REQUIRED', 'CREDITS_INSUFFICIENT'])

// When the batch preflight says no (T107): a plan or credit limit is a paywall moment, opened on
// the tier the server named (Max for several templates) or on credits; anything else is said in
// one line above Generate, in the words of app.errors.
export function useBatchRefusal() {
  const paywall = usePaywall()
  const errors = useTranslations('app.errors')
  const tiers = useTranslations('paywall.tiers')

  const handle = (error: PreflightError) => {
    if (error.code === 'TIER_REQUIRED') paywall.open('tier_required', { step: 'period', tier: error.required_tier ?? 'pro' })
    if (error.code === 'CREDITS_INSUFFICIENT') paywall.open('insufficient_credits')
  }

  const message = (error: PreflightError | null): string | null => {
    if (!error || PAYWALL_CODES.has(error.code)) return null
    return errors.has(error.code) ? errors(error.code, { tier: tiers(error.required_tier ?? 'pro') }) : errors('fallback')
  }

  return { handle, message }
}

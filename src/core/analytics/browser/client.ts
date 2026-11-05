'use client'

import * as Sentry from '@sentry/nextjs'
import posthog from 'posthog-js'

import { logger } from '../../logger'
import { publicEnv } from '../../public-env'
import { validateEvent, type BrowserEventName, type EventProps } from '../events'
import { sentryOptions } from '../sentry-options'
import { posthogConfig } from './posthog-config'

let started = false

// Runs once from src/instrumentation-client.ts, before hydration. Either SDK stays off
// when its public key is missing (local dev, CI, before the Owner sets the Sentry DSN).
export function initBrowserAnalytics(): void {
  if (started) return
  started = true
  const sentry = sentryOptions()
  if (sentry.enabled) Sentry.init(sentry)
  if (publicEnv.NEXT_PUBLIC_POSTHOG_KEY) posthog.init(publicEnv.NEXT_PUBLIC_POSTHOG_KEY, posthogConfig())
}

const enabled = () => started && Boolean(publicEnv.NEXT_PUBLIC_POSTHOG_KEY)

// Browser events of the §16.2 dictionary only; money and credit events are server-side.
export function track<E extends BrowserEventName>(event: E, props: EventProps<E>): void {
  if (!enabled()) return
  const checked = validateEvent(event, props)
  if (!checked.ok) {
    logger.error('analytics event refused', { event, issues: checked.issues })
    return
  }
  posthog.capture(event, checked.props)
}

export function trackPaywallView(trigger: EventProps<'paywall_view'>['trigger']): void {
  track('paywall_view', { trigger })
}

// The Supabase user id, nothing else: no email or name as person properties (§16.1).
export function identify(userId: string): void {
  if (enabled() && posthog.get_distinct_id() !== userId) posthog.identify(userId)
}

// Call on sign-out before the redirect, so the next visitor on this tab is anonymous.
export function resetIdentity(): void {
  if (enabled()) posthog.reset()
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart

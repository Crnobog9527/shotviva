'use client'

import { logger } from '../../logger'
import { publicEnv } from '../../public-env'
import { validateEvent, type BrowserEventName, type EventProps } from '../events'
import { sentryOptions } from '../sentry-options'
import { posthogConfig } from './posthog-config'
import { afterLoad, loadedSdks, loadSdks, withSdks } from './sdk'

let started = false

// Runs once from src/instrumentation-client.ts, before hydration, but only schedules the SDKs:
// both are fetched and started after the page's load event (sdk.ts), so they stay off the
// critical path. Either SDK stays off when its public key is missing (local dev, CI).
export function initBrowserAnalytics(): void {
  if (started) return
  started = true
  const sentry = sentryOptions()
  const key = publicEnv.NEXT_PUBLIC_POSTHOG_KEY
  if (!sentry.enabled && !key) return
  afterLoad(() => {
    void loadSdks({
      sentry: sentry.enabled
        ? async () => {
            const sdk = await import('@sentry/nextjs')
            sdk.init(sentry)
            return sdk
          }
        : null,
      posthog: key
        ? async () => {
            const { default: posthog } = await import('posthog-js')
            posthog.init(key, posthogConfig())
            return posthog
          }
        : null,
    })
  })
}

const enabled = () => started && Boolean(publicEnv.NEXT_PUBLIC_POSTHOG_KEY)

// Browser events of the §16.2 dictionary only; money and credit events are server-side.
// Checked now; sent once PostHog is in (sdk.ts queues the first seconds).
export function track<E extends BrowserEventName>(event: E, props: EventProps<E>): void {
  if (!enabled()) return
  const checked = validateEvent(event, props)
  if (!checked.ok) {
    logger.error('analytics event refused', { event, issues: checked.issues })
    return
  }
  withSdks(({ posthog }) => posthog?.capture(event, checked.props))
}

export function trackPaywallView(trigger: EventProps<'paywall_view'>['trigger']): void {
  track('paywall_view', { trigger })
}

export function trackContactSales(page: EventProps<'contact_sales_click'>['page']): void {
  track('contact_sales_click', { page })
}

// The Supabase user id, nothing else: no email or name as person properties (§16.1).
export function identify(userId: string): void {
  if (!enabled()) return
  withSdks(({ posthog }) => {
    if (posthog && posthog.get_distinct_id() !== userId) posthog.identify(userId)
  })
}

// Call on sign-out before the redirect, so the next visitor on this tab is anonymous.
export function resetIdentity(): void {
  if (enabled()) withSdks(({ posthog }) => posthog?.reset())
}

// Next calls this on every client navigation. Before Sentry is in there is nothing to record
// (tracing is off, sentry-options.ts), so navigations are not queued.
export function onRouterTransitionStart(href: string, navigationType: string): void {
  loadedSdks()?.sentry?.captureRouterTransitionStart(href, navigationType)
}

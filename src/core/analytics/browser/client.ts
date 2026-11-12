'use client'

import { logger } from '../../logger'
import { publicEnv } from '../../public-env'
import { persistenceFor } from '../consent/decision'
import { onConsentChange, readConsent } from '../consent/store'
import { categorySlug } from '../event-values'
import type { BrowserEventName, EventProps } from '../events'
import { sentryOptions } from '../sentry-options'
import { clearPosthogStorage, syncPosthog } from './consent-sync'
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
            const sdk = await import('./sentry-entry')
            sdk.init(sentry)
            return sdk
          }
        : null,
      posthog: key
        ? async () => {
            const { default: posthog } = await import('posthog-js')
            posthog.init(key, posthogConfig(readConsent(), window.location.pathname))
            return posthog
          }
        : null,
    })
  })
  if (key) watchConsent()
}

// ARCHITECTURE §16.1 (T70): cookies or memory follow the visitor's region and answer; an answer
// given on the bar applies at once, before or after PostHog is in (the queue keeps it in order).
function watchConsent(): void {
  if (persistenceFor(readConsent()) === 'memory') clearStorage()
  onConsentChange((consent) =>
    withSdks(({ posthog }) => {
      if (!posthog) return
      syncPosthog(posthog, consent, window.location.pathname)
      // set_config clears the cookie and localStorage; the tab's window id in sessionStorage is
      // kept by PostHog's session manager, outside its persistence.
      if (persistenceFor(consent) === 'memory') clearStorage()
    }),
  )
}

function clearStorage(): void {
  try {
    clearPosthogStorage(document, [window.localStorage, window.sessionStorage])
  } catch {
    // Storage blocked: there is nothing of ours in it either.
  }
}

const enabled = () => started && Boolean(publicEnv.NEXT_PUBLIC_POSTHOG_KEY)

// The dictionary's zod schemas (about 30 KB gzip with zod) load with the first event, not with
// the page: every marketing page used to carry them in its first-load JavaScript (mobile
// Lighthouse, 2026-11-11). One shared import, so events keep the order they were tracked in.
let events: Promise<typeof import('../events')> | null = null
const loadEvents = () => (events ??= import('../events'))

// Browser events of the §16.2 dictionary only; money and credit events are server-side.
// Checked before anything is sent; sent once PostHog is in (sdk.ts queues the first seconds).
export function track<E extends BrowserEventName>(event: E, props: EventProps<E>): void {
  if (!enabled()) return
  void loadEvents().then(({ validateEvent }) => {
    const checked = validateEvent(event, props)
    if (!checked.ok) {
      logger.error('analytics event refused', { event, issues: checked.issues })
      return
    }
    withSdks(({ posthog }) => posthog?.capture(event, checked.props))
  })
}

export function trackPaywallView(trigger: EventProps<'paywall_view'>['trigger']): void {
  track('paywall_view', { trigger })
}

export function trackContactSales(page: EventProps<'contact_sales_click'>['page']): void {
  track('contact_sales_click', { page })
}

// T86: sent once the server has stored the inquiry.
export function trackBusinessInquiry(props: EventProps<'business_inquiry_submit'>): void {
  track('business_inquiry_submit', props)
}

// T74 (ARCHITECTURE §16.2): a template looked at, a product picked in the paywall, a failed upload.
// `category` is the template's category as stored (display name before T75, key after); it is
// sent as categorySlug, the same value `generate` carries.
export function trackTemplateView(template: { id: string; category: string }, surface: EventProps<'template_view'>['surface']): void {
  track('template_view', { template_id: template.id, category: categorySlug(template.category), surface })
}

// Create's All: 「查看全部」 on a root category's section (Owner 2026-11-12).
export function trackCatalogueSeeAll(category: string): void {
  track('catalogue_see_all', { category: categorySlug(category) })
}

export function trackTemplateFavorite(
  template: { id: string; category: string },
  action: EventProps<'template_favorite'>['action'],
  surface: EventProps<'template_favorite'>['surface'],
): void {
  track('template_favorite', { template_id: template.id, category: categorySlug(template.category), action, surface })
}

// T89: the confirm dialog of a template toggle, or the toggle turned off.
export function trackTemplateToggle(props: EventProps<'template_toggle'>): void {
  track('template_toggle', props)
}

export function trackPaywallSelect(props: EventProps<'paywall_select'>): void {
  track('paywall_select', props)
}

export function trackUploadError(reason: EventProps<'upload_error'>['reason']): void {
  track('upload_error', { reason })
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
// PostHog's replay is held off before /admin and /checkout are shown and let go after them.
export function onRouterTransitionStart(href: string, navigationType: string): void {
  const sdks = loadedSdks()
  sdks?.sentry?.captureRouterTransitionStart(href, navigationType)
  if (sdks?.posthog) syncPosthog(sdks.posthog, readConsent(), href)
}

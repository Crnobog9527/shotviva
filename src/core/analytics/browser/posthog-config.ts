import type { CaptureResult, PostHogConfig } from 'posthog-js'

import { localeOfPath } from '../../i18n/paths'
import { persistenceFor, replayAllowed, type Consent } from '../consent/decision'
import { REPLAY_BLOCK_CLASS } from '../replay'

// ARCHITECTURE §16.1. Kept as a pure object so a unit test can pin every privacy setting.
export const INGEST_PATH = '/ingest'

const URL_PROPS = new Set(['$current_url', '$referrer', '$initial_referrer', '$prev_pageview_url'])
const SENSITIVE_PARAM = /code|token|e-?mail|key|secret|signature|x-amz|password/i
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

// Auth links carry one-time codes (?code=…, #access_token=…); campaign params (utm_*) stay.
export function scrubUrl(value: string): string {
  try {
    const url = new URL(value)
    url.hash = ''
    for (const name of [...url.searchParams.keys()]) {
      if (SENSITIVE_PARAM.test(name)) url.searchParams.delete(name)
    }
    return url.toString()
  } catch {
    return value.replace(EMAIL, '[email]')
  }
}

function scrubProperty(key: string, value: unknown): unknown {
  if (typeof value !== 'string') return value
  return URL_PROPS.has(key) ? scrubUrl(value) : value.replace(EMAIL, '[email]')
}

// Autocapture reads element text, and the account page shows the user's email; every string
// property is checked, not only the event dictionary's own properties.
export function scrubCapture(capture: CaptureResult | null): CaptureResult | null {
  if (!capture) return capture
  const properties = Object.fromEntries(
    Object.entries(capture.properties ?? {}).map(([key, value]) => [key, scrubProperty(key, value)]),
  )
  return { ...capture, properties }
}

// Every browser event carries the language of the page it happened on (ARCHITECTURE §16.2),
// read at capture time so a client-side hop between /zh and English pages stays right.
export function withLocale(capture: CaptureResult | null, pathname: string): CaptureResult | null {
  if (!capture) return capture
  return { ...capture, properties: { ...capture.properties, locale: localeOfPath(pathname) } }
}

// What the replay recorder may see, prepared before replay is ever switched on (T70): every
// input and textarea masked, and the user's own photos and works blocked (drawn as an empty box)
// wherever they carry REPLAY_BLOCK_CLASS. The client-side values win over the project's
// "Privacy and masking" settings.
export const REPLAY_MASKING = {
  maskAllInputs: true,
  blockSelector: `.${REPLAY_BLOCK_CLASS}`,
} as const

// `consent` decides cookies or memory (ARCHITECTURE §16.1, T70); `pathname` keeps replay off on
// pages that must never be recorded. Both change later through set_config (consent-sync.ts).
export function posthogConfig(consent: Consent, pathname: string): Partial<PostHogConfig> {
  return {
    // Same-origin proxy (next.config.ts rewrites) so ad blockers do not drop events.
    api_host: INGEST_PATH,
    ui_host: 'https://us.posthog.com',
    defaults: '2026-01-30',
    // Cookies outside the EU/EEA/UK/CH or after "Accept"; otherwise nothing stored in the browser.
    persistence: persistenceFor(consent),
    // Anonymous visitors get no person profile; identify() after sign-in creates one and merges
    // the anonymous events before it into it.
    person_profiles: 'identified_only',
    capture_pageview: 'history_change',
    capture_pageleave: 'if_capture_pageview',
    autocapture: true,
    // Not forced on: the PostHog project's replay switch and sampling decide. Kept off here only
    // without cookie consent and on /admin and /checkout.
    disable_session_recording: !replayAllowed(consent, pathname),
    session_recording: REPLAY_MASKING,
    // These features keep their own state in localStorage; none is used in v1.
    disable_surveys: true,
    disable_product_tours: true,
    disable_conversations: true,
    disable_web_experiments: true,
    before_send: (capture) => withLocale(scrubCapture(capture), window.location.pathname),
  }
}

import type { CaptureResult, PostHogConfig } from 'posthog-js'

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

export function posthogConfig(): Partial<PostHogConfig> {
  return {
    // Same-origin proxy (next.config.ts rewrites) so ad blockers do not drop events.
    api_host: INGEST_PATH,
    ui_host: 'https://us.posthog.com',
    defaults: '2026-01-30',
    // No cookie, no localStorage: nothing to consent to, hence no cookie banner.
    persistence: 'memory',
    // Anonymous visitors get no person profile; identify() after sign-in creates one.
    person_profiles: 'identified_only',
    capture_pageview: 'history_change',
    capture_pageleave: 'if_capture_pageview',
    autocapture: true,
    // Session Replay stays off until the Owner decides otherwise (masking + privacy policy).
    disable_session_recording: true,
    // These features keep their own state in localStorage; none is used in v1.
    disable_surveys: true,
    disable_product_tours: true,
    disable_conversations: true,
    disable_web_experiments: true,
    before_send: scrubCapture,
  }
}

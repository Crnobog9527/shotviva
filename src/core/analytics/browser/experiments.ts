'use client'

import type { PostHog } from 'posthog-js'

import { EXPERIMENT_COOKIE, EXPERIMENT_COOKIE_MAX_AGE, parseExperimentCookie, serializeExperimentCookie, type CookieEntry } from '../../experiments/cookie'
import { posthogSdk } from './sdk'

// A/B experiments in analytics (ARCHITECTURE §16.5). The proxy writes the sv_exp cookie; here every
// browser event is tagged with the visitor's variants (exp_<experiment> = variant id, as PostHog
// super properties), and a new or changed assignment (flag n / r) is reported once as
// experiment_exposure, after which the flag is cleared. Forced test-site assignments (flag f) are
// neither tagged nor reported.

function readCookie(doc: Document, name: string): string | undefined {
  const prefix = `${name}=`
  return doc.cookie
    .split('; ')
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length)
}

type ExperimentSdk = Pick<PostHog, 'register' | 'capture'>

function assignments(doc: Document) {
  return parseExperimentCookie(readCookie(doc, EXPERIMENT_COOKIE))
}

// The cookie parser bounds ids to 12 decimal digits; zero and forced assignments are not real variants.
const countable = ({ experiment, current, first, flag }: CookieEntry) =>
  experiment > 0 && current > 0 && first > 0 && flag !== 'f'

export function tagExperiments(sdk: Pick<PostHog, 'register'>, doc: Document): void {
  registerAssignments(sdk, assignments(doc))
}

function registerAssignments(sdk: Pick<PostHog, 'register'>, entries: Map<number, CookieEntry>): void {
  const tags = Object.fromEntries([...entries.values()].filter(countable).map(({ experiment, current }) => [`exp_${experiment}`, current]))
  if (Object.keys(tags).length > 0) sdk.register(tags)
}

export function reportExperiments(doc: Document = document): void {
  posthogSdk.run((posthog) => captureExperimentExposures(posthog, doc))
}

export function captureExperimentExposures(posthog: ExperimentSdk, doc: Document): void {
  // Read when the SDK is ready: multiple pre-load beacons then see the same, updated cookie.
  const entries = assignments(doc)
  registerAssignments(posthog, entries)
  let sent = false
  for (const entry of entries.values()) {
    if (!countable(entry) || (entry.flag !== 'n' && entry.flag !== 'r')) continue
    if (!posthog.capture('experiment_exposure', {
      experiment_id: entry.experiment,
      variant_id: entry.current,
      first_variant_id: entry.first,
      reassigned: entry.flag === 'r',
    })) continue
    entries.set(entry.experiment, { ...entry, flag: '' })
    sent = true
  }
  if (!sent) return
  const secure = doc.location.protocol === 'https:' ? '; secure' : ''
  doc.cookie = `${EXPERIMENT_COOKIE}=${serializeExperimentCookie(entries.values())}; path=/; max-age=${EXPERIMENT_COOKIE_MAX_AGE}; samesite=lax${secure}`
}

'use client'

import { EXPERIMENT_COOKIE, EXPERIMENT_COOKIE_MAX_AGE, parseExperimentCookie, serializeExperimentCookie } from '../../experiments'
import { track } from './client'
import { withSdks } from './sdk'

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

export function reportExperiments(doc: Document = document): void {
  const entries = parseExperimentCookie(readCookie(doc, EXPERIMENT_COOKIE))
  const counted = [...entries.values()].filter((entry) => entry.flag !== 'f')
  if (counted.length === 0) return
  const props = Object.fromEntries(counted.map((entry) => [`exp_${entry.experiment}`, entry.current]))
  withSdks(({ posthog }) => posthog?.register(props))
  const fresh = counted.filter((entry) => entry.flag === 'n' || entry.flag === 'r')
  if (fresh.length === 0) return
  for (const entry of fresh) {
    track('experiment_exposure', {
      experiment_id: entry.experiment,
      variant_id: entry.current,
      first_variant_id: entry.first,
      reassigned: entry.flag === 'r',
    })
    entries.set(entry.experiment, { ...entry, flag: '' })
  }
  const secure = window.location.protocol === 'https:' ? '; secure' : ''
  doc.cookie = `${EXPERIMENT_COOKIE}=${serializeExperimentCookie(entries.values())}; path=/; max-age=${EXPERIMENT_COOKIE_MAX_AGE}; samesite=lax${secure}`
}

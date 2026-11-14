import type { PostHog, PostHogConfig } from 'posthog-js'

import { persistenceFor, replayAllowed, type Consent } from '../consent/decision'

type Sdk = Pick<PostHog, 'set_config'> & { config: Pick<PostHogConfig, 'persistence' | 'disable_session_recording'> }

// Brings a running PostHog in line with the visitor's answer and the current page (T70), live:
// set_config({ persistence }) moves what PostHog holds (the anonymous id included) from memory
// into the cookie and localStorage on "Accept", and back out (clearing them) on "Necessary
// only", so the path before the answer stays one person. Only what changed is set: every
// set_config restarts PostHog's extensions.
export function syncPosthog(posthog: Sdk, consent: Consent, pathname: string): void {
  const patch: Partial<PostHogConfig> = {}
  const persistence = persistenceFor(consent)
  if (posthog.config.persistence !== persistence) patch.persistence = persistence
  const noReplay = !replayAllowed(consent, pathname)
  if (posthog.config.disable_session_recording !== noReplay) patch.disable_session_recording = noReplay
  if (Object.keys(patch).length > 0) posthog.set_config(patch)
}

const POSTHOG_KEY = /^_?_?ph_/

// A visitor recorded with cookies before (another region, or an answer since cleared) who now
// runs in memory: PostHog in memory mode never reads or removes what it left behind, so remove
// it here. Cookies are tried on the host and each parent domain, where PostHog may have set them.
export function clearPosthogStorage(doc: Document, storages: Storage[]): void {
  const names = doc.cookie
    .split(/;\s*/)
    .map((pair) => pair.split('=')[0])
    .filter((name) => POSTHOG_KEY.test(name))
  const labels = doc.location.hostname.split('.')
  const domains = [null, ...labels.slice(0, -1).map((_, i) => labels.slice(i).join('.'))]
  for (const name of names) {
    for (const domain of domains) {
      doc.cookie = `${name}=; Max-Age=0; Path=/${domain ? `; Domain=${domain}` : ''}`
    }
  }
  for (const storage of storages) {
    for (const key of Object.keys(storage)) if (POSTHOG_KEY.test(key)) storage.removeItem(key)
  }
}

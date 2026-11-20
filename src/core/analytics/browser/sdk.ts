import type { PostHog } from 'posthog-js'

type SentrySdk = typeof import('./sentry-entry')
export type Sdks = { sentry: SentrySdk | null; posthog: PostHog | null }
export type SdkLoaders = { sentry: (() => Promise<SentrySdk>) | null; posthog: (() => Promise<PostHog>) | null }

type Job = (sdks: Sdks) => void

// Events and errors of the first seconds, before the SDKs are in. A page that keeps failing
// before load must not grow this without bound.
export const MAX_QUEUED = 50

let sdks: Sdks | null = null
let queue: Job[] = []

// Runs `job` with the SDKs, now if they are loaded, else once they are (in order).
export function withSdks(job: Job): void {
  if (sdks) {
    job(sdks)
    return
  }
  if (queue.length < MAX_QUEUED) queue.push(job)
}

export const loadedSdks = (): Sdks | null => sdks

export async function loadSdks(load: SdkLoaders): Promise<void> {
  const [sentry, posthog] = await Promise.all([load.sentry ? load.sentry() : null, load.posthog ? load.posthog() : null])
  sdks = { sentry, posthog }
  const pending = queue
  queue = []
  for (const job of pending) {
    try {
      job(sdks)
    } catch {
      // A failed capture must not stop the ones after it.
    }
  }
}

// Both SDKs (≈160 KB gzip together) used to load and start before hydration on every page,
// competing with the CSS and the page's own code for a phone's bandwidth. They now start once
// the page has loaded and the main thread is idle.
export function afterLoad(start: () => void): void {
  const idle = () => (typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(start, { timeout: 3000 }) : window.setTimeout(start, 1))
  if (document.readyState === 'complete') idle()
  else window.addEventListener('load', idle, { once: true })
}

// Tests only.
export function resetSdksForTest(): void {
  sdks = null
  queue = []
}

import type { PostHog } from 'posthog-js'

type SentrySdk = typeof import('./sentry-entry')
type Job<T> = (sdk: T) => void

// Keep errors and events independent: a slow or blocked analytics request must not stop
// monitoring, and a blocked Sentry chunk must not drop traffic.
export const MAX_QUEUED = 50

export function createSdk<T>() {
  let sdk: T | null | undefined
  const queue: Job<T>[] = []

  const runSafely = (job: Job<T>, active: T) => {
    try {
      job(active)
    } catch {
      // Analytics failures must not break the UI or stop later jobs from being reported.
    }
  }

  return {
    current: () => sdk,
    run(job: Job<T>) {
      if (sdk) runSafely(job, sdk)
      else if (sdk === undefined && queue.length < MAX_QUEUED) queue.push(job)
    },
    async load(loader: (() => Promise<T>) | null) {
      try {
        sdk = loader ? await loader() : null
      } catch {
        sdk = null
      }
      const pending = queue.splice(0)
      if (sdk) for (const job of pending) runSafely(job, sdk)
    },
  }
}

export const sentrySdk = createSdk<SentrySdk>()
export const posthogSdk = createSdk<PostHog>()

// Wait for the page to load, and give pending input and rendering priority over SDK work.
export function afterLoad(start: () => void): void {
  const idle = () => (typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(start, { timeout: 3000 }) : window.setTimeout(start, 1))
  if (document.readyState === 'complete') idle()
  else window.addEventListener('load', idle, { once: true })
}

// Give PostHog a turn to start on its own without making Sentry wait on a stalled import.
export function afterPosthog(posthog: Promise<void>, start: () => void): void {
  let scheduled = false
  const schedule = () => {
    if (scheduled) return
    scheduled = true
    window.clearTimeout(timer)
    afterLoad(start)
  }
  const timer = window.setTimeout(schedule, 1000)
  void posthog.then(schedule)
}

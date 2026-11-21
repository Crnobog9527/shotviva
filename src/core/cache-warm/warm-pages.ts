import 'server-only'

import { schedule } from '../alerts/schedule'
import { logger } from '../logger'
import { appOrigin } from '../site-url'

// Public pages after an admin save (2026-11-21). Admin saves expire their cache tags at once
// (updateTag / revalidateTag with expire 0) so the next load shows the change; every marketing
// page carries those tags (templates, providers, announcements, blog footer, products,
// features), so the next visitor to each page waited for a full render: x-vercel-cache
// REVALIDATED, 1.3-2.1 s on production against 0.1 s on a HIT. Right after the save, the server
// asks for each public page once, one at a time, so that render is paid here instead.
//
// One warm at a time per instance: saves that arrive while one runs ask for one more pass,
// which then sees all of them. Never in development (nothing is cached there).

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>

const PAUSE_MS = 200

type State = { running: boolean; again: boolean }
const state: State = { running: false, again: false }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function warmOnce(origin: string, paths: readonly string[], fetcher: Fetcher, pause: number): Promise<number> {
  let failed = 0
  for (const path of paths) {
    try {
      const response = await fetcher(`${origin}${path}`, { headers: { accept: 'text/html', 'user-agent': 'ShotvivaCacheWarm/1.0' }, cache: 'no-store', redirect: 'follow' })
      await response.arrayBuffer()
      if (!response.ok) failed++
    } catch {
      failed++
    }
    if (pause) await sleep(pause)
  }
  return failed
}

// Runs passes until no save asked for another one. Exported for tests.
export async function runWarm(origin: string, paths: readonly string[], fetcher: Fetcher = fetch, pause = PAUSE_MS, s: State = state): Promise<void> {
  if (s.running) {
    s.again = true
    return
  }
  s.running = true
  try {
    do {
      s.again = false
      const failed = await warmOnce(origin, paths, fetcher, pause)
      logger.info('cache_warm.done', { pages: paths.length, failed })
    } while (s.again)
  } finally {
    s.running = false
  }
}

export function isWarmableOrigin(origin: string): boolean {
  return origin.startsWith('https://')
}

// After the response is sent (after()); never awaited, never throws.
export function warmPagesSoon(paths: readonly string[], origin: string = appOrigin): void {
  if (!isWarmableOrigin(origin) || paths.length === 0) return
  schedule(() => runWarm(origin, paths))
}

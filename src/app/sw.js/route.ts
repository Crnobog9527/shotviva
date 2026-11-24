import { connection } from 'next/server'

import { serviceWorkerResponse } from '@/core/offline/server'
import { serviceWorkerEnabled, serviceWorkerShellEnabled } from '@/core/system-settings'

// The service worker (core/offline): public by nature (AGENTS §6), served at the site root so its
// scope is the whole site. It answers only content-hashed static files and the catalogue file at a
// version from its cache; navigations go to the network; other requests are left alone. On or off
// (and the kill switch) is the admin switch system_settings service_worker_enabled, read per
// request (a cached read its save expires), so it takes effect without a deploy. The proxy matcher
// skips this path.
export async function GET() {
  await connection()
  // Create's app shell (ARCHITECTURE §18.3) is its own switch, and only with the worker on.
  // MEASUREMENT ONLY (perf/app-shell-measure, never merged): the shell is on for previews without
  // the switch, so the launch gate can be measured before the migration reaches the database.
  const [enabled, shell] = await Promise.all([serviceWorkerEnabled(), process.env.VERCEL_ENV === 'preview' ? Promise.resolve(true) : serviceWorkerShellEnabled()])
  return serviceWorkerResponse(enabled, shell)
}

import 'server-only'

import { after } from 'next/server'

import { onServerError } from '../analytics/server-errors'
import { noteServerError } from './notify'

// Called once from src/instrumentation.ts on the Node runtime. Counting is synchronous; a send
// (rare: at most one per 30 minutes) is handed to after() so the platform keeps the function
// alive until it finishes. Outside a request scope after() throws, and the promise just runs.
export function registerOwnerErrorAlerts(): void {
  onServerError((signal) => {
    const task = noteServerError(signal)
    try {
      after(task)
    } catch {
      // No request scope (start-up, a timer): nothing to extend.
    }
  })
}

import 'server-only'

import { onServerError } from '../analytics/server-errors'
import { noteServerError } from './notify'

// Called once from src/instrumentation.ts on the Node runtime. Counting is synchronous and
// in memory; a send (at most one per 30 minutes) goes to after() inside noteServerError.
export function registerOwnerErrorAlerts(): void {
  onServerError(noteServerError)
}

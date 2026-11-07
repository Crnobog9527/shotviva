import { after } from 'next/server'

// Owner alerts never hold up the request that raised them (control review 2026-11-08): the work
// is handed to after(), which runs it once the response is sent and keeps the function alive
// until it finishes. Outside a request scope (start-up, tests) after() throws; the work then
// just runs on its own. Either way nothing is awaited by the caller and nothing is thrown.
export function schedule(work: () => Promise<void>): void {
  const run = () => work().catch(() => undefined)
  try {
    after(run)
  } catch {
    void run()
  }
}

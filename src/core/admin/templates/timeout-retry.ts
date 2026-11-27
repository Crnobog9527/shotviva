// Admin reads that the template editor needs to render (the template list, the image cost quote).
// The test database stalls for 10-20 s every few hours (every query slow at once, 2026-11-26/27,
// before and after #963), and a read caught in it hits the 8 s statement timeout. After a save,
// refresh() re-renders the editor: one timed-out read showed 「加载失败」 although the save had
// gone through (PR #963 validation, 2026-11-27 12:20Z). Read-only and idempotent, so a statement
// timeout (57014) is tried once more after a pause; any other error is returned as it is.

export const STATEMENT_TIMEOUT = '57014'
const PAUSE_MS = 1_500

type Result = { error: { code?: string } | null }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function retryStatementTimeout<T extends Result>(read: () => PromiseLike<T>, pause = PAUSE_MS): Promise<T> {
  const first = await read()
  if (first.error?.code !== STATEMENT_TIMEOUT) return first
  await sleep(pause)
  return read()
}

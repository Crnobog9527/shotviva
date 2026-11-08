// Signs that this tab runs an older build than the server (T90): a Server Action the server no
// longer knows, or a code chunk that is gone. Either way a reload is the fix, so the
// new-version banner shows at once instead of the feature failing with a confusing error.

// Next answers an unknown Server Action with this header and throws UnrecognizedActionError.
export const ACTION_NOT_FOUND_HEADER = 'x-nextjs-action-not-found'

const STALE_NAMES = new Set(['ChunkLoadError', 'UnrecognizedActionError'])
// webpack, Turbopack, and the browsers' own dynamic import() failures.
const STALE_MESSAGE =
  /Loading (?:CSS )?chunk [^\s]+ failed|Failed to load chunk|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Server Action "[^"]*" was not found on the server/i

export function isStaleBuildError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { name, message } = error as { name?: unknown; message?: unknown }
  if (typeof name === 'string' && STALE_NAMES.has(name)) return true
  return typeof message === 'string' && STALE_MESSAGE.test(message)
}

const listeners = new Set<() => void>()
// A failure before the banner's slot has mounted (during hydration) is not lost: the first
// listener hears it on subscribing.
let missed = false

export function signalStaleBuild(): void {
  if (listeners.size === 0) missed = true
  listeners.forEach((listener) => listener())
}

export function onStaleBuild(listener: () => void): () => void {
  listeners.add(listener)
  if (missed) {
    missed = false
    listener()
  }
  return () => listeners.delete(listener)
}

// For error boundaries and catch blocks that swallow the error the global listeners never see.
export function reportIfStaleBuild(error: unknown): void {
  if (isStaleBuildError(error)) signalStaleBuild()
}

type WatchedWindow = Pick<Window, 'addEventListener'> & { fetch: typeof fetch }

let watching = false

// Installed once from instrumentation-client, before hydration. The fetch wrapper only reads a
// response header and hands back the same response: Next's router calls the global fetch at
// call time, so Server Action calls pass through it. Callers that catch the thrown error still
// get it; the banner shows regardless.
export function watchStaleBuild(win: WatchedWindow): void {
  if (watching) return
  watching = true
  win.addEventListener('unhandledrejection', (event) => reportIfStaleBuild((event as PromiseRejectionEvent).reason))
  win.addEventListener('error', (event) => reportIfStaleBuild((event as ErrorEvent).error))
  const original = win.fetch.bind(win)
  win.fetch = async (...args: Parameters<typeof fetch>) => {
    const response = await original(...args)
    if (response.headers.get(ACTION_NOT_FOUND_HEADER) === '1') signalStaleBuild()
    return response
  }
}

export function resetStaleBuildWatchForTests(): void {
  watching = false
  missed = false
  listeners.clear()
}

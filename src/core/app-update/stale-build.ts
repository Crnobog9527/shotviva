// Signs that this tab runs an older build than the server (T90): a Server Action the server no
// longer knows, or a code chunk that is gone. Either way a reload is the fix, so the
// new-version banner shows at once instead of the feature failing with a confusing error.

// Next answers an unknown Server Action with this header and throws UnrecognizedActionError.
export const ACTION_NOT_FOUND_HEADER = 'x-nextjs-action-not-found'

// 'action': the server told us it does not know this tab's Server Action — certain, shown at
// once. 'chunk': a code chunk failed to load, which an offline or flaky connection also causes,
// so the banner waits until /api/version confirms a newer build.
export type StaleKind = 'action' | 'chunk'

const ACTION_MESSAGE = /Server Action "[^"]*" was not found on the server/i
// webpack, Turbopack, and the browsers' own dynamic import() failures.
const CHUNK_MESSAGE =
  /Loading (?:CSS )?chunk [^\s]+ failed|Failed to load chunk|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i

export function staleBuildKind(error: unknown): StaleKind | null {
  if (typeof error !== 'object' || error === null) return null
  const { name, message } = error as { name?: unknown; message?: unknown }
  const text = typeof message === 'string' ? message : ''
  if (name === 'UnrecognizedActionError' || ACTION_MESSAGE.test(text)) return 'action'
  if (name === 'ChunkLoadError' || CHUNK_MESSAGE.test(text)) return 'chunk'
  return null
}

export const isStaleBuildError = (error: unknown): boolean => staleBuildKind(error) !== null

type Listener = (kind: StaleKind) => void

const listeners = new Set<Listener>()
// A failure before the banner's slot has mounted (during hydration) is not lost: the first
// listener hears it on subscribing (the more certain kind wins).
let missed: StaleKind | null = null

export function signalStaleBuild(kind: StaleKind): void {
  if (listeners.size === 0 && missed !== 'action') missed = kind
  listeners.forEach((listener) => listener(kind))
}

export function onStaleBuild(listener: Listener): () => void {
  listeners.add(listener)
  if (missed) {
    const kind = missed
    missed = null
    listener(kind)
  }
  return () => listeners.delete(listener)
}

// For error boundaries and catch blocks that swallow the error the global listeners never see.
export function reportIfStaleBuild(error: unknown): void {
  const kind = staleBuildKind(error)
  if (kind) signalStaleBuild(kind)
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
    if (response.headers.get(ACTION_NOT_FOUND_HEADER) === '1') signalStaleBuild('action')
    return response
  }
}

export function resetStaleBuildWatchForTests(): void {
  watching = false
  missed = null
  listeners.clear()
}

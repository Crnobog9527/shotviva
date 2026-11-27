// The two names every page's service-worker slot needs (register.tsx, in the root layout), kept
// apart from sw.ts and shell-fallback.ts so the public pages' first load carries neither the
// worker's source nor the app shell's code (js:budget, after #946).
export const CACHE_PREFIX = 'sv-'
export const SHELL_BYPASS_PARAM = 'sv-net'

// The address without the bypass parameter, or null when it has none (shell-fallback.ts).
export function withoutBypass(href: string): string | null {
  const url = new URL(href)
  if (!url.searchParams.has(SHELL_BYPASS_PARAM)) return null
  url.searchParams.delete(SHELL_BYPASS_PARAM)
  return url.pathname + url.search + url.hash
}

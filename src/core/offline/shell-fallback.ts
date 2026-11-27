// The way out of Create's app shell (ARCHITECTURE §18.3; Part B on the test site, 2026-11-27): the
// shell must never hold the visitor. It hands over to the network page, past the shell, when
//   - the real page has not replaced it within SHELL_FALLBACK_MS of the refresh (a slow or failing
//     server render), or
//   - the shell is answered again in the same tab within SHELL_LOOP_MS of the last time without
//     having been replaced in between: a failed refresh makes Next load the address in full, which
//     the worker would answer with the shell again, over and over.
// "Past the shell" is the address with SHELL_BYPASS_PARAM: the worker never answers it with the
// shell, the proxy never answers its navigation preload with the empty 204 (shell-proxy.ts), and
// the page drops the parameter from the address bar once loaded (register.tsx).
export const SHELL_BYPASS_PARAM = 'sv-net'
export const SHELL_FALLBACK_MS = 8_000
export const SHELL_LOOP_MS = 20_000
// sessionStorage: when this tab was last answered with the shell, cleared once the shell goes.
export const SHELL_PENDING_KEY = 'sv-shell-pending'

// Self-contained (no outer names), as shellBootScript embeds its source.
export function bypassHref(href: string, param: string = SHELL_BYPASS_PARAM): string {
  const url = new URL(href)
  url.searchParams.set(param, '1')
  return url.href
}

// The address without the bypass parameter, or null when it has none.
export function withoutBypass(href: string): string | null {
  const url = new URL(href)
  if (!url.searchParams.has(SHELL_BYPASS_PARAM)) return null
  url.searchParams.delete(SHELL_BYPASS_PARAM)
  return url.pathname + url.search + url.hash
}

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>

// Run while the shell's HTML is parsed (before hydration) when the worker answered the visitor's
// address with it: true when this is the loop above and the tab should leave for the network now.
// Otherwise it records this answer. Without storage (private mode, blocked): never a loop.
// Self-contained (no outer names), as shellBootScript embeds its source.
export function shellLooping(storage: Storage | null, now: number, key: string = SHELL_PENDING_KEY, within: number = SHELL_LOOP_MS): boolean {
  try {
    if (!storage) return false
    const last = Number(storage.getItem(key)) || 0
    if (last && now - last >= 0 && now - last < within) {
      storage.removeItem(key)
      return true
    }
    storage.setItem(key, String(now))
  } catch {
    // No storage: never a loop.
  }
  return false
}

// The shell is gone (replaced by the real page, or the visitor left it): no loop to detect.
export function shellSettled(storage: Storage | null): void {
  try {
    storage?.removeItem(SHELL_PENDING_KEY)
  } catch {
    // Nothing kept.
  }
}

export function sessionStore(win: { sessionStorage: Storage }): Storage | null {
  try {
    return win.sessionStorage
  } catch {
    return null
  }
}

type ShellWindow = { __svShell?: { leaving?: boolean }; sessionStorage: Storage; location: { href: string; replace: (href: string) => void } }

// The real page did not come in time (ShellFrame's timer): load it from the network, past the
// shell, in place of this history entry. Once only.
export function leaveShell(win: ShellWindow): void {
  if (!win.__svShell || win.__svShell.leaving) return
  win.__svShell.leaving = true
  shellSettled(sessionStore(win))
  win.location.replace(bypassHref(win.location.href))
}

// The inline script of the shell page (app-shell/generate/page.tsx): the address the visitor opened,
// the loop check, and, in the foreground, the worker's early refresh (shell-worker.ts). Plain
// script built from the functions above, so the tests run the same code. It passes every argument:
// the defaults name outer constants, which the minifier renames (checked on a production build).
export function shellBootScript(): string {
  const args = (...values: unknown[]) => values.map((value) => JSON.stringify(value)).join(',')
  return [
    '(function(){window.__svShell={href:location.href};try{',
    `var looping=${shellLooping.toString()},bypass=${bypassHref.toString()};`,
    "if(location.pathname.indexOf('/app-shell/')<0){var store=null;try{store=window.sessionStorage}catch(e){}",
    `if(looping(store,Date.now(),${args(SHELL_PENDING_KEY, SHELL_LOOP_MS)})){window.__svShell.leaving=true;location.replace(bypass(location.href,${args(SHELL_BYPASS_PARAM)}));return}}`,
    "var c=navigator.serviceWorker&&navigator.serviceWorker.controller;if(c&&document.visibilityState==='visible')c.postMessage({type:'sv-shell-early',href:location.href})",
    '}catch(e){}})()',
  ].join('')
}

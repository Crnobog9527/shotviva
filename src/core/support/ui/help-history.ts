import { HELP_PARAM, helpParamValue, type HelpView } from './help-param'

// The Help dialog's history entries (T68). Opening from the Support row pushes one entry, marked
// in its state; moving inside the dialog replaces the current entry; closing goes back over a
// marked entry. So the phone's Back button (and the browser's) closes the dialog instead of
// leaving the page.
//
// Arriving with ?help= already in the address (a deep link, a reload, an old /account/help link
// that redirected) there is no entry of ours yet. Safari and Chrome skip, on Back, history
// entries a page added without a user gesture (their anti-"back trap" rule), so adding them on
// load does nothing for Back (Codex, #262). Instead the bare account page is put underneath and
// the dialog's entry pushed on the visitor's first press or key in the page, which counts as a
// gesture. Back before any interaction leaves the page, like on any other page.

export const MARK = 'svHelp'

// What the hook needs from the browser; tests pass a fake.
export type HistoryPort = {
  href(): string
  state(): unknown
  push(state: unknown, url: string): void
  replace(state: unknown, url: string): void
  back(): void
  // Runs `run` once on the first user gesture; returns a cancel.
  onFirstGesture(run: () => void): () => void
}

// `href` with ?help= set to `view`, or removed; path, other params and hash kept.
export function urlWith(href: string, view: HelpView | null): string {
  const url = new URL(href)
  if (view) url.searchParams.set(HELP_PARAM, helpParamValue(view))
  else url.searchParams.delete(HELP_PARAM)
  return `${url.pathname}${url.search}${url.hash}`
}

export function ownsEntry(state: unknown): boolean {
  return typeof state === 'object' && state !== null && MARK in state
}

const marked = () => ({ [MARK]: true })

// The Support row: a click, so the new entry is never skipped.
export function openIn(port: HistoryPort, view: HelpView) {
  port.push(marked(), urlWith(port.href(), view))
}

// Moving inside the dialog keeps whatever the current entry is (ours or the arrival entry).
export function goIn(port: HistoryPort, view: HelpView) {
  port.replace(ownsEntry(port.state()) ? marked() : null, urlWith(port.href(), view))
}

export function closeIn(port: HistoryPort) {
  if (ownsEntry(port.state())) port.back()
  else port.replace(null, urlWith(port.href(), null))
}

// Called while the dialog is open. Without an entry of ours yet, waits for the first gesture,
// then: current entry → the bare account page, new marked entry → where the dialog is now.
// Returns a cancel (the dialog closed or unmounted first).
export function arriveIn(port: HistoryPort): () => void {
  if (ownsEntry(port.state())) return () => {}
  return port.onFirstGesture(() => {
    if (ownsEntry(port.state())) return
    const here = new URL(port.href())
    port.replace(null, urlWith(here.href, null))
    port.push(marked(), `${here.pathname}${here.search}${here.hash}`)
  })
}

// Gestures that give the page user activation: a key (Escape does not count) or the end of a
// press. Listened to in the capture phase, so the entry exists before the same event's handlers
// in the dialog (a tab switch, the close button) use it.
function firstGesture(run: () => void): () => void {
  const options = { capture: true } as const
  const cancel = () => {
    window.removeEventListener('pointerup', onPointer, options)
    window.removeEventListener('keydown', onKey, options)
  }
  function fire() {
    cancel()
    run()
  }
  function onPointer() {
    fire()
  }
  function onKey(event: KeyboardEvent) {
    if (event.key !== 'Escape') fire()
  }
  window.addEventListener('pointerup', onPointer, options)
  window.addEventListener('keydown', onKey, options)
  return cancel
}

export const browserHistory: HistoryPort = {
  href: () => window.location.href,
  state: () => window.history.state as unknown,
  push: (state, url) => window.history.pushState(state, '', url),
  replace: (state, url) => window.history.replaceState(state, '', url),
  back: () => window.history.back(),
  onFirstGesture: firstGesture,
}

import { DIALOG_STATE_KEY, withoutUser, withUser } from './dialog-url'

// History entries of the user detail dialog, the T68 Help dialog's rule in short: opening from a
// link pushes one marked entry; moving to another user inside the dialog replaces it; closing
// steps back over a marked entry, else drops ?user= in place (a deep link or a lookup redirect).
// Next.js keeps useSearchParams in step with pushState / replaceState, without a server request,
// so the list behind the dialog keeps its scroll position and its selection.

export type HistoryPort = {
  href(): string
  state(): unknown
  push(state: unknown, url: string): void
  replace(state: unknown, url: string): void
  back(): void
}

const marked = () => ({ [DIALOG_STATE_KEY]: true })

export function ownsEntry(state: unknown): boolean {
  return typeof state === 'object' && state !== null && DIALOG_STATE_KEY in state
}

export function openUser(port: HistoryPort, userId: string, jobId: string | null = null) {
  const url = withUser(port.href(), userId, jobId)
  if (ownsEntry(port.state())) port.replace(marked(), url)
  else port.push(marked(), url)
}

export function closeUser(port: HistoryPort) {
  if (ownsEntry(port.state())) port.back()
  else port.replace(null, withoutUser(port.href()))
}

export const browserHistory: HistoryPort = {
  href: () => window.location.href,
  state: () => window.history.state as unknown,
  push: (state, url) => window.history.pushState(state, '', url),
  replace: (state, url) => window.history.replaceState(state, '', url),
  back: () => window.history.back(),
}

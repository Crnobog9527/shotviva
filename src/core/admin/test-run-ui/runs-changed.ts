// The cover translation dialog (in the cover tabs) and the test-run panel (beside the form) hold
// their own data. A finished translation is also a test run, so the dialog announces it and the
// panel reloads its records and budget (T87). Page-local, nothing leaves the browser.
const EVENT = 'shotviva:admin-test-runs-changed'

export function announceRunsChanged(): void {
  window.dispatchEvent(new Event(EVENT))
}

export function onRunsChanged(listener: () => void): () => void {
  window.addEventListener(EVENT, listener)
  return () => window.removeEventListener(EVENT, listener)
}

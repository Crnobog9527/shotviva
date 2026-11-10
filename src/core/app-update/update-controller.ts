import { DEV_APP_VERSION } from '../app-version'
import type { Holds } from './holds'
import type { StaleKind } from './stale-build'

// The new-version banner's logic (T90), free of React and the DOM so it can be tested: when to
// ask the server for its version, when the banner shows, and what a dismissal covers.

export const CHECK_EVERY_MS = 10 * 60_000
// A tab flipped back and forth does not ask more than once a minute.
const MIN_GAP_MS = 60_000

export type UpdateReason = 'version' | 'error'
export type UpdateAction = 'shown' | 'refreshed' | 'dismissed'

// `version` is the newer build the server reported; null when an error showed the banner
// before (or without) the server answering.
type Pending = { reason: UpdateReason; version: string | null }

export type UpdateView = { show: false } | { show: true; reason: UpdateReason; photosHeld: boolean }

type VisibilityTarget = {
  visibilityState: DocumentVisibilityState
  addEventListener(type: 'visibilitychange', listener: () => void): void
  removeEventListener(type: 'visibilitychange', listener: () => void): void
}

export type UpdateDeps = {
  current: string
  fetchServed(): Promise<string | null>
  readDismissed(): string | null
  writeDismissed(key: string): void
  track(action: UpdateAction, reason: UpdateReason): void
  reload(): void
  now(): number
  doc: VisibilityTarget
  setInterval(run: () => void, ms: number): unknown
  clearInterval(handle: unknown): void
}

// What a dismissal is remembered by: the newer version, or, for an error with no version
// known, the build that failed (so the next deployment can still ask).
const keyOf = (pending: Pending, current: string) => pending.version ?? `error:${current}`

const sameView = (a: UpdateView, b: UpdateView) =>
  a.show === b.show && (!a.show || (b.show && a.reason === b.reason && a.photosHeld === b.photosHeld))

export class UpdateController {
  private readonly enabled: boolean
  private pending: Pending | null = null
  private holds: Holds = { busy: false, photos: false }
  private dismissed: string | null
  private lastCheck = -Infinity
  // A failure the banner can fix shows it again even for a version already dismissed: the
  // visitor is stuck until they reload. Dismissing that one hides it until the next failure.
  private errorHidden = false
  private errors = 0
  // A chunk failed to load: shown only if the next answer names a newer build (it may be offline).
  private chunkFailed = false
  private shownEpisode: string | null = null
  private view: UpdateView = { show: false }
  private readonly listeners = new Set<() => void>()

  constructor(private readonly deps: UpdateDeps) {
    this.enabled = deps.current !== DEV_APP_VERSION
    this.dismissed = deps.readDismissed()
  }

  getView = (): UpdateView => this.view

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  // Listens for the tab coming back and checks every 10 minutes while it is visible.
  start(): () => void {
    if (!this.enabled) return () => undefined
    const { doc } = this.deps
    const onVisible = () => {
      if (doc.visibilityState === 'visible') void this.check()
    }
    doc.addEventListener('visibilitychange', onVisible)
    const timer = this.deps.setInterval(() => {
      if (doc.visibilityState === 'visible') void this.check(true)
    }, CHECK_EVERY_MS)
    return () => {
      doc.removeEventListener('visibilitychange', onVisible)
      this.deps.clearInterval(timer)
    }
  }

  async check(force = false): Promise<void> {
    if (!this.enabled) return
    const at = this.deps.now()
    if (!force && at - this.lastCheck < MIN_GAP_MS) return
    this.lastCheck = at
    this.served(await this.deps.fetchServed().catch(() => null))
  }

  // An unknown Server Action shows at once, then learns which version is live; a failed chunk
  // asks the server first and shows only if a newer build is there (offline, nothing shows).
  staleBuild(kind: StaleKind): void {
    if (!this.enabled) return
    if (kind === 'chunk') {
      this.chunkFailed = true
    } else {
      this.newFailure(this.pending?.version ?? null)
      this.publish()
    }
    void this.check(true)
  }

  setHolds(next: Holds): void {
    this.holds = next
    this.publish()
  }

  dismiss(): void {
    const { pending } = this
    if (!pending || !this.view.show) return
    this.dismissed = keyOf(pending, this.deps.current)
    this.deps.writeDismissed(this.dismissed)
    if (pending.reason === 'error') this.errorHidden = true
    this.deps.track('dismissed', pending.reason)
    this.publish()
  }

  refresh(): void {
    if (this.pending) this.deps.track('refreshed', this.pending.reason)
    this.deps.reload()
  }

  private served(version: string | null): void {
    const chunkFailed = this.chunkFailed
    this.chunkFailed = false
    if (!version || version === this.deps.current || version === DEV_APP_VERSION) return
    const { pending } = this
    if (chunkFailed) this.newFailure(version)
    // An error banner learns which version it is about; the reason it showed stays.
    else if (pending?.reason === 'error' && pending.version === null) this.pending = { ...pending, version }
    // A version the tab has not been told about yet: a fresh offer, whatever came before
    // (a dismissed error banner does not hide the next release).
    else if (pending?.version !== version) {
      this.pending = { reason: 'version', version }
      this.errorHidden = false
    }
    this.publish()
  }

  private newFailure(version: string | null): void {
    this.pending = { reason: 'error', version }
    this.errorHidden = false
    this.errors += 1
  }

  private compute(): UpdateView {
    const { pending, holds } = this
    if (!pending || holds.busy) return { show: false }
    const hidden = pending.reason === 'error' ? this.errorHidden : keyOf(pending, this.deps.current) === this.dismissed
    return hidden ? { show: false } : { show: true, reason: pending.reason, photosHeld: holds.photos }
  }

  private publish(): void {
    const next = this.compute()
    if (sameView(next, this.view)) return
    this.view = next
    // Once per version and per failure, not each time a hold lets it back on screen.
    if (next.show && this.pending) {
      const episode = `${next.reason}:${keyOf(this.pending, this.deps.current)}:${this.errors}`
      if (episode !== this.shownEpisode) {
        this.shownEpisode = episode
        this.deps.track('shown', next.reason)
      }
    }
    this.listeners.forEach((listener) => listener())
  }
}

export function createUpdateController(deps: UpdateDeps): UpdateController {
  return new UpdateController(deps)
}

// The page stays where it was across a dialog (Owner 2026-11-25: /admin/templates ended up near the
// top after 批量编辑 or saving a template). Radix's scroll lock (react-remove-scroll-bar: overflow:
// hidden on <body>, marked data-scroll-locked) shrinks the page's scroll range while a dialog is
// open, so the browser moves the page up and it stays there. When the dialog's lock ends, the
// position from before it is put back, but only when that is still the right thing:
// - the lock came from one of our dialogs (not a sheet or a select, which lock too);
// - the page is still the same address (a dialog that navigated must not drag the new page);
// - nothing scrolled the page on purpose during the lock (it is where the lock left it).

const LOCK = 'data-scroll-locked'

export type KeeperHost = {
  scrollY: () => number
  scrollTo: (top: number) => void
  locked: () => boolean
  // A dialog of ours is open (core/ui/dialog.tsx marks its content data-slot="dialog-content").
  dialogOpen: () => boolean
  // The page's address, path and query.
  address: () => string
  onScroll: (listener: () => void) => void
  onLockChange: (listener: () => void) => void
  afterLayout: (run: () => void) => void
}

type Lock = { top: number; address: string; forced: number | null }

const near = (a: number, b: number) => Math.abs(a - b) <= 1

export function keepScrollAcrossLocks(host: KeeperHost) {
  let top = host.scrollY()
  let wasLocked = host.locked()
  let lock: Lock | null = null
  host.onScroll(() => {
    if (!host.locked()) top = host.scrollY()
  })
  const start = () => {
    const started: Lock = { top, address: host.address(), forced: null }
    lock = started
    // Where the lock itself leaves the page, once its styles are laid out.
    host.afterLayout(() => { started.forced = host.scrollY() })
  }
  const end = (ended: Lock) => {
    const atUnlock = host.scrollY()
    const scrolledOnPurpose = ended.forced !== null && !near(atUnlock, ended.forced)
    host.afterLayout(() => {
      if (host.address() !== ended.address || scrolledOnPurpose) return
      if (!near(host.scrollY(), ended.top)) host.scrollTo(ended.top)
    })
  }
  host.onLockChange(() => {
    const locked = host.locked()
    if (!wasLocked && locked && host.dialogOpen()) start()
    if (wasLocked && !locked && lock) {
      end(lock)
      lock = null
    }
    wasLocked = locked
  })
}

// One keeper per page, whatever installs it and however often (HMR re-runs this module).
const INSTALLED = Symbol.for('shotviva.scrollLockKeeper')

export function installScrollLockKeeper() {
  if (typeof window === 'undefined') return
  const flags = window as unknown as Record<symbol, boolean>
  if (flags[INSTALLED]) return
  flags[INSTALLED] = true
  keepScrollAcrossLocks({
    scrollY: () => window.scrollY,
    scrollTo: (top) => window.scrollTo({ top, behavior: 'instant' }),
    locked: () => document.body.hasAttribute(LOCK),
    dialogOpen: () => document.querySelector('[data-slot="dialog-content"]') !== null,
    address: () => window.location.pathname + window.location.search,
    onScroll: (listener) => window.addEventListener('scroll', listener, { passive: true }),
    onLockChange: (listener) => new MutationObserver(listener).observe(document.body, { attributes: true, attributeFilter: [LOCK] }),
    afterLayout: (run) => requestAnimationFrame(() => requestAnimationFrame(run)),
  })
}

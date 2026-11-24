// The page stays where it was across a dialog (Owner 2026-11-25: /admin/templates ended up near the
// top after 批量编辑 or saving a template). Radix's scroll lock (react-remove-scroll-bar: overflow:
// hidden on <body>, marked data-scroll-locked) shrinks the page's scroll range while a dialog is
// open, so the browser moves the page up and it stays there. Nothing can scroll the page behind an
// open dialog, so the last position from before the lock is put back once the lock is gone.

const LOCK = 'data-scroll-locked'

export type KeeperHost = {
  scrollY: () => number
  scrollTo: (top: number) => void
  locked: () => boolean
  onScroll: (listener: () => void) => void
  onLockChange: (listener: () => void) => void
  afterLayout: (run: () => void) => void
}

// Remembers the position while unlocked; restores it when a lock ends.
export function keepScrollAcrossLocks(host: KeeperHost) {
  let top = host.scrollY()
  let wasLocked = host.locked()
  host.onScroll(() => {
    if (!host.locked()) top = host.scrollY()
  })
  host.onLockChange(() => {
    const locked = host.locked()
    if (wasLocked && !locked) {
      const target = top
      host.afterLayout(() => {
        if (Math.abs(host.scrollY() - target) > 1) host.scrollTo(target)
      })
    }
    wasLocked = locked
  })
}

let installed = false

// Once per page, from any dialog (core/ui/dialog.tsx).
export function installScrollLockKeeper() {
  if (installed || typeof window === 'undefined') return
  installed = true
  keepScrollAcrossLocks({
    scrollY: () => window.scrollY,
    scrollTo: (top) => window.scrollTo({ top, behavior: 'instant' }),
    locked: () => document.body.hasAttribute(LOCK),
    onScroll: (listener) => window.addEventListener('scroll', listener, { passive: true }),
    onLockChange: (listener) => new MutationObserver(listener).observe(document.body, { attributes: true, attributeFilter: [LOCK] }),
    afterLayout: (run) => requestAnimationFrame(() => requestAnimationFrame(run)),
  })
}

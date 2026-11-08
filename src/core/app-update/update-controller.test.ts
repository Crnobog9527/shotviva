import { describe, expect, it, vi } from 'vitest'

import { CHECK_EVERY_MS, createUpdateController, type UpdateDeps } from './update-controller'

// A fake tab: a document whose visibility the test flips, a clock, one interval, and a server
// whose version the test changes (a new deployment).
// The document's visibility, flipped by the test.
function fakeDocument() {
  let visibility: DocumentVisibilityState = 'visible'
  const listeners = new Set<() => void>()
  const doc: UpdateDeps['doc'] = {
    get visibilityState() {
      return visibility
    },
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
  }
  const flip = (next: DocumentVisibilityState) => {
    visibility = next
    listeners.forEach((listener) => listener())
  }
  return { doc, flip }
}

function tab(options: { current?: string; served?: string | null; dismissed?: string | null } = {}) {
  let served: string | null = options.served ?? 'dpl_old'
  const { doc, flip } = fakeDocument()
  let clock = 1_000_000
  let interval: (() => void) | null = null
  const stored = { value: options.dismissed ?? null }
  const deps: UpdateDeps = {
    current: options.current ?? 'dpl_old',
    fetchServed: vi.fn(async () => served),
    readDismissed: () => stored.value,
    writeDismissed: vi.fn((key: string) => {
      stored.value = key
    }),
    track: vi.fn(),
    reload: vi.fn(),
    now: () => clock,
    doc,
    setInterval: (run) => {
      interval = run
      return 1
    },
    clearInterval: () => {
      interval = null
    },
  }
  const updates = createUpdateController(deps)
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
  return {
    deps,
    updates,
    stored,
    deploy: (version: string | null) => {
      served = version
    },
    advance: (ms: number) => {
      clock += ms
    },
    async hide() {
      flip('hidden')
      await settle()
    },
    async show() {
      flip('visible')
      await settle()
    },
    async tick() {
      interval?.()
      await settle()
    },
    hasInterval: () => interval !== null,
  }
}

describe('version check (T90)', () => {
  it('asks when the tab comes back and every 10 minutes while visible', async () => {
    const t = tab()
    t.updates.start()
    await t.show()
    expect(t.updates.getView()).toEqual({ show: false })
    t.deploy('dpl_new')
    t.advance(CHECK_EVERY_MS)
    await t.tick()
    expect(t.updates.getView()).toEqual({ show: true, reason: 'version', photosHeld: false })
    expect(t.deps.track).toHaveBeenCalledWith('shown', 'version')
  })

  it('does not ask while the tab is hidden, nor twice within a minute of switching back', async () => {
    const t = tab()
    t.updates.start()
    await t.hide()
    await t.tick()
    expect(t.deps.fetchServed).not.toHaveBeenCalled()
    await t.show()
    await t.show()
    expect(t.deps.fetchServed).toHaveBeenCalledTimes(1)
    t.advance(61_000)
    await t.show()
    expect(t.deps.fetchServed).toHaveBeenCalledTimes(2)
  })

  it('never checks in local dev, and errors do not show it there', async () => {
    const t = tab({ current: 'dev', served: 'dpl_new' })
    const stop = t.updates.start()
    expect(t.hasInterval()).toBe(false)
    await t.show()
    t.updates.staleBuild()
    expect(t.deps.fetchServed).not.toHaveBeenCalled()
    expect(t.updates.getView()).toEqual({ show: false })
    stop()
  })

  it('ignores a failed request, an empty answer and the same version', async () => {
    const t = tab()
    t.deploy(null)
    await t.updates.check(true)
    t.deploy('dpl_old')
    await t.updates.check(true)
    expect(t.updates.getView()).toEqual({ show: false })
  })

  it('stops listening when stopped', async () => {
    const t = tab()
    const stop = t.updates.start()
    stop()
    expect(t.hasInterval()).toBe(false)
    await t.show()
    expect(t.deps.fetchServed).not.toHaveBeenCalled()
  })
})

describe('busy gating (T90)', () => {
  it('waits for an upload, a generation or a checkout to end, then shows', async () => {
    const t = tab()
    t.updates.setHolds({ busy: true, photos: false })
    t.deploy('dpl_new')
    await t.updates.check(true)
    expect(t.updates.getView()).toEqual({ show: false })
    expect(t.deps.track).not.toHaveBeenCalled()
    t.updates.setHolds({ busy: false, photos: false })
    expect(t.updates.getView()).toEqual({ show: true, reason: 'version', photosHeld: false })
  })

  it('hides again when something starts, and counts it shown once', async () => {
    const t = tab()
    t.deploy('dpl_new')
    await t.updates.check(true)
    t.updates.setHolds({ busy: true, photos: false })
    expect(t.updates.getView()).toEqual({ show: false })
    t.updates.setHolds({ busy: false, photos: false })
    expect(t.updates.getView().show).toBe(true)
    expect(t.deps.track).toHaveBeenCalledTimes(1)
  })

  it('adds the line about photos picked but not generated', async () => {
    const t = tab()
    t.deploy('dpl_new')
    t.updates.setHolds({ busy: false, photos: true })
    await t.updates.check(true)
    expect(t.updates.getView()).toEqual({ show: true, reason: 'version', photosHeld: true })
  })
})

describe('dismiss per version (T90)', () => {
  it('remembers the version dismissed and asks again for the next one', async () => {
    const t = tab()
    t.deploy('dpl_new')
    await t.updates.check(true)
    t.updates.dismiss()
    expect(t.stored.value).toBe('dpl_new')
    expect(t.deps.track).toHaveBeenLastCalledWith('dismissed', 'version')
    expect(t.updates.getView()).toEqual({ show: false })
    await t.updates.check(true)
    expect(t.updates.getView()).toEqual({ show: false })
    t.deploy('dpl_newer')
    await t.updates.check(true)
    expect(t.updates.getView().show).toBe(true)
  })

  it('stays dismissed for that version in a new tab (stored)', async () => {
    const t = tab({ dismissed: 'dpl_new' })
    t.deploy('dpl_new')
    await t.updates.check(true)
    expect(t.updates.getView()).toEqual({ show: false })
  })

  it('refresh reloads the page and is tracked; it never reloads on its own', async () => {
    const t = tab()
    t.deploy('dpl_new')
    await t.updates.check(true)
    expect(t.deps.reload).not.toHaveBeenCalled()
    t.updates.refresh()
    expect(t.deps.track).toHaveBeenLastCalledWith('refreshed', 'version')
    expect(t.deps.reload).toHaveBeenCalledTimes(1)
  })
})

describe('error trigger (T90)', () => {
  it('shows at once on a stale-build error, then asks which version is live', async () => {
    const t = tab()
    t.deploy('dpl_new')
    t.updates.staleBuild()
    expect(t.updates.getView()).toEqual({ show: true, reason: 'error', photosHeld: false })
    expect(t.deps.track).toHaveBeenCalledWith('shown', 'error')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(t.deps.fetchServed).toHaveBeenCalledTimes(1)
    t.updates.dismiss()
    // The version it was about is remembered, so the next check does not bring it back.
    expect(t.stored.value).toBe('dpl_new')
    await t.updates.check(true)
    expect(t.updates.getView()).toEqual({ show: false })
  })

  it('shows again on a new failure even after the version was dismissed', async () => {
    const t = tab()
    t.deploy('dpl_new')
    await t.updates.check(true)
    t.updates.dismiss()
    t.updates.staleBuild()
    expect(t.updates.getView()).toEqual({ show: true, reason: 'error', photosHeld: false })
    expect(t.deps.track).toHaveBeenLastCalledWith('shown', 'error')
  })

  it('still waits for a running generation', () => {
    const t = tab()
    t.updates.setHolds({ busy: true, photos: false })
    t.updates.staleBuild()
    expect(t.updates.getView()).toEqual({ show: false })
    t.updates.setHolds({ busy: false, photos: false })
    expect(t.updates.getView()).toEqual({ show: true, reason: 'error', photosHeld: false })
  })

  it('a dismissed error with no version known is remembered against this build', () => {
    const t = tab()
    t.deploy(null)
    t.updates.staleBuild()
    t.updates.dismiss()
    expect(t.stored.value).toBe('error:dpl_old')
    expect(t.updates.getView()).toEqual({ show: false })
  })
})

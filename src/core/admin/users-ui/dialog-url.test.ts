import { describe, expect, it } from 'vitest'

import { browserHistory, closeUser, openUser, ownsEntry, type HistoryPort } from './dialog-history'
import { isPlainClick, withoutUser, withUser } from './dialog-url'

const ID = '3f2b8c1e-9a4d-4e7b-8c21-5d6f7a8b9c0d'
const JOB = '0b6f3f0e-5d1c-4c47-9a49-6a3f6f8d2e11'

describe('user dialog address (T77)', () => {
  it('adds and removes ?user= and ?userJob=, keeping the page and its filters', () => {
    expect(withUser('/admin/jobs?status=failed', ID)).toBe(`/admin/jobs?status=failed&user=${ID}`)
    expect(withUser(`/admin/users?user=${JOB}&userJob=${JOB}`, ID)).toBe(`/admin/users?user=${ID}`)
    expect(withUser('/admin/jobs', ID, JOB)).toBe(`/admin/jobs?user=${ID}&userJob=${JOB}`)
    expect(withoutUser(`https://shotviva.com/admin/orders?user=${ID}&userJob=${JOB}&page=2#x`)).toBe('/admin/orders?page=2#x')
  })

  it('opens in place only on a plain left click', () => {
    const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }
    expect(isPlainClick(click)).toBe(true)
    expect(isPlainClick({ ...click, metaKey: true })).toBe(false)
    expect(isPlainClick({ ...click, button: 1 })).toBe(false)
  })
})

function fakeHistory(href: string, state: unknown = null) {
  const calls: string[] = []
  let current = { href: new URL(href, 'https://shotviva.com').href, state }
  const port: HistoryPort = {
    href: () => current.href,
    state: () => current.state,
    push: (next, url) => {
      calls.push(`push ${url}`)
      current = { href: new URL(url, current.href).href, state: next }
    },
    replace: (next, url) => {
      calls.push(`replace ${url}`)
      current = { href: new URL(url, current.href).href, state: next }
    },
    back: () => calls.push('back'),
  }
  return { port, calls, state: () => current.state }
}

describe('user dialog history', () => {
  it('pushes one marked entry on open and steps back over it on close', () => {
    const { port, calls, state } = fakeHistory('/admin/users?tier=max')
    openUser(port, ID)
    expect(ownsEntry(state())).toBe(true)
    openUser(port, JOB)
    closeUser(port)
    expect(calls).toEqual([`push /admin/users?tier=max&user=${ID}`, `replace /admin/users?tier=max&user=${JOB}`, 'back'])
  })

  it('drops ?user= in place when the dialog came with the address (a lookup, a shared link)', () => {
    const { port, calls } = fakeHistory(`/admin/users?q=a&user=${ID}`)
    closeUser(port)
    expect(calls).toEqual(['replace /admin/users?q=a'])
  })

  it('reads the real browser history', () => {
    expect(typeof browserHistory.back).toBe('function')
  })
})

import { describe, expect, it, vi } from 'vitest'

import type { HistoryPort } from '../users-ui/dialog-history'
import { reloading } from './record-dialog'
import { closeRecord, INQUIRY_PARAM, isRecordId, openRecord, TICKET_PARAM, withoutRecord, withRecord } from './record-dialog-url'

const ID = '3f2b8c1e-9a4d-4e7b-8c21-5d6f7a8b9c0d'
const OTHER = '0b6f3f0e-5d1c-4c47-9a49-6a3f6f8d2e11'

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
  return { port, calls }
}

describe('record dialog address', () => {
  it('adds and removes ?ticket= / ?inquiry=, keeping the list filter and page', () => {
    expect(withRecord('/admin/tickets?status=all&type=refund&cursor=abc', TICKET_PARAM, ID)).toBe(
      `/admin/tickets?status=all&type=refund&cursor=abc&ticket=${ID}`,
    )
    expect(withRecord(`/admin/inquiries?inquiry=${OTHER}`, INQUIRY_PARAM, ID)).toBe(`/admin/inquiries?inquiry=${ID}`)
    expect(withoutRecord(`https://shotviva.com/admin/tickets?status=closed&ticket=${ID}#x`, TICKET_PARAM)).toBe('/admin/tickets?status=closed#x')
  })

  it('only takes a uuid as a record id', () => {
    expect(isRecordId(ID)).toBe(true)
    expect(isRecordId('../users')).toBe(false)
    expect(isRecordId(null)).toBe(false)
  })
})

describe('record dialog history', () => {
  it('pushes one marked entry on open, replaces it for another record and steps back on close', () => {
    const { port, calls } = fakeHistory('/admin/tickets?status=all')
    openRecord(port, TICKET_PARAM, ID)
    openRecord(port, TICKET_PARAM, OTHER)
    closeRecord(port, TICKET_PARAM)
    expect(calls).toEqual([`push /admin/tickets?status=all&ticket=${ID}`, `replace /admin/tickets?status=all&ticket=${OTHER}`, 'back'])
  })

  it('drops the param in place when the dialog came with the address (old detail URL, a shared link)', () => {
    const { port, calls } = fakeHistory(`/admin/inquiries?status=new&inquiry=${ID}`)
    closeRecord(port, INQUIRY_PARAM)
    expect(calls).toEqual(['replace /admin/inquiries?status=new'])
  })

  it('keeps the two dialogs’ entries apart', () => {
    const { port, calls } = fakeHistory('/admin/tickets')
    openRecord(port, TICKET_PARAM, ID)
    closeRecord(port, INQUIRY_PARAM)
    expect(calls.at(-1)).toBe(`replace /admin/tickets?ticket=${ID}`)
  })
})

describe('reloading', () => {
  it('reads the dialog again only after an action worked', async () => {
    const reload = vi.fn()
    await reloading(async () => ({ ok: false, code: 'CONFLICT', message: '' }) as const, reload)({})
    expect(reload).not.toHaveBeenCalled()
    await reloading(async () => ({ ok: true }) as const, reload)({})
    expect(reload).toHaveBeenCalledTimes(1)
  })
})

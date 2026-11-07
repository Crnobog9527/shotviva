import { describe, expect, it } from 'vitest'

import { helpParamValue, isTicketId, parseHelpJob, parseHelpParam, tabOf } from './help-param'

const ID = '3f2b8c1e-9a4d-4e7b-8c21-5d6f7a8b9c0d'

describe('?help= on the account page (T68)', () => {
  it('opens New ticket, My tickets, or one ticket', () => {
    expect(parseHelpParam('new')).toEqual({ tab: 'new' })
    expect(parseHelpParam('list')).toEqual({ tab: 'list' })
    expect(parseHelpParam(ID)).toEqual({ tab: 'thread', id: ID })
  })

  it('reads a ticket id case-insensitively and keeps it lower case', () => {
    expect(parseHelpParam(ID.toUpperCase())).toEqual({ tab: 'thread', id: ID })
  })

  it.each([null, undefined, '', 'New', 'LIST', 'thread', 'open', '123', `${ID}x`, ` ${ID}`, `${ID}/../x`, 'javascript:alert(1)'])(
    'leaves the dialog closed for %j',
    (value) => {
      expect(parseHelpParam(value)).toBeNull()
    },
  )

  it('round-trips every view through the param', () => {
    for (const value of ['new', 'list', ID]) {
      const view = parseHelpParam(value)
      expect(view && helpParamValue(view)).toBe(value)
    }
  })

  it('lights My tickets for a thread', () => {
    expect(tabOf({ tab: 'new' })).toBe('new')
    expect(tabOf({ tab: 'list' })).toBe('list')
    expect(tabOf({ tab: 'thread', id: ID })).toBe('list')
  })

  it('checks ticket ids as UUIDs', () => {
    expect(isTicketId(ID)).toBe(true)
    expect(isTicketId('not-a-uuid')).toBe(false)
  })

  it('reads the work sent along by the photo page as a job id, or nothing (T78)', () => {
    expect(parseHelpJob(ID.toUpperCase())).toBe(ID)
    expect(parseHelpJob('2fa821c6')).toBeNull()
    expect(parseHelpJob('javascript:alert(1)')).toBeNull()
    expect(parseHelpJob(null)).toBeNull()
  })
})

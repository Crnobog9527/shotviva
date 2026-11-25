import { describe, expect, it, vi } from 'vitest'

import type { PanelRequest } from './panel-request'
import { takePanelQueryWhen } from './use-template-panel'

// A fake address bar: what replaceState leaves is what the next generator reads.
function address(search: string) {
  const place = { pathname: '/zh', search, hash: '' }
  const history = { state: null, replaceState: vi.fn((_state: unknown, _title: string, url: string) => { place.search = url.slice(place.pathname.length) }) }
  return { place, history }
}

describe('reopening the panel after sign-in', () => {
  it('leaves ?panel= for the real generator when the signed-out stand-in mounts first', () => {
    const { place, history } = address('?panel=cake&set=bundle%3Abundle-b1&utm_source=x')
    const opened: PanelRequest[] = []
    // After a password or phone sign-in the Suspense fallback (not settled) mounts first…
    expect(takePanelQueryWhen(false, place, history, (request) => opened.push(request))).toBe('waiting')
    expect(place.search).toBe('?panel=cake&set=bundle%3Abundle-b1&utm_source=x')
    expect(opened).toEqual([])
    // …then the generator with the session takes it, once, and clears it from the address.
    expect(takePanelQueryWhen(true, place, history, (request) => opened.push(request))).toBe('taken')
    expect(opened).toEqual([{ templateId: 'cake', set: { kind: 'bundle', id: 'bundle-b1' } }])
    expect(place.search).toBe('?utm_source=x')
    expect(takePanelQueryWhen(true, place, history, (request) => opened.push(request))).toBe('none')
    expect(opened).toHaveLength(1)
  })

  it('takes the 404\'s ?open=<id> too', () => {
    const { place, history } = address('?open=tea')
    const opened: PanelRequest[] = []
    expect(takePanelQueryWhen(true, place, history, (request) => opened.push(request))).toBe('taken')
    expect(opened).toEqual([{ templateId: 'tea', set: null }])
    expect(place.search).toBe('')
  })
})

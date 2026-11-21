import { afterEach, describe, expect, it, vi } from 'vitest'

import { PRIVATE_ROOTS, PVUV_API } from './pvuv'
import { installPvuvScrub, resetPvuvScrubForTest, scrubFirstTouchCookie, scrubPvuvBody, scrubPvuvUrl } from './pvuv-scrub'

const scrub = (url: string) => scrubPvuvUrl(url, PRIVATE_ROOTS)

describe('scrubPvuvUrl', () => {
  it('drops hash and every query parameter but the campaign tags', () => {
    expect(scrub('https://shotviva.com/pricing?code=abc&utm_source=x&utm_medium=cpc&next=%2Fjoin%2Forg%2Ftok#access_token=zzz')).toBe('https://shotviva.com/pricing?utm_source=x&utm_medium=cpc')
  })
  it('cuts the signed-in app and admin to their first segment, in both languages', () => {
    expect(scrub('https://shotviva.com/generate/job-123?x=1')).toBe('https://shotviva.com/generate')
    expect(scrub('https://shotviva.com/zh/account/billing')).toBe('https://shotviva.com/zh/account')
    expect(scrub('https://shotviva.com/checkout/return?session_id=cs_live_1')).toBe('https://shotviva.com/checkout')
    expect(scrub('https://shotviva.com/admin/users/42')).toBe('https://shotviva.com/admin')
  })
  it('redacts an org invite token wherever it is', () => {
    expect(scrub('https://shotviva.com/join/org/SECRET')).toBe('https://shotviva.com/join')
    expect(scrub('https://shotviva.com/login/join/org/SECRET')).toBe('https://shotviva.com/login/join/org/[redacted]')
  })
  it('keeps an external referrer to its origin and path', () => {
    expect(scrub('https://www.google.com/search?q=private')).toBe('https://www.google.com/search')
    expect(scrub('https://chatgpt.com/')).toBe('https://chatgpt.com/')
  })
})

describe('scrubPvuvBody', () => {
  const beat = {
    s: 'W7', e: 'pageview', u: 'https://shotviva.com/pricing?code=1#t=2', r: 'https://shotviva.com/checkout/return?session_id=cs_1',
    ft: { s: 'google', r: 'https://shotviva.com/join/org/TOKEN' }, uid: 'u1',
    p: { href: 'https://other.com/a?b=c', form: '#signup', err: [{ m: 'failed for a@b.co at /join/org/TOK2' }] },
  }
  it('cleans one beat or an array, and leaves other fields', () => {
    const one = JSON.parse(scrubPvuvBody(JSON.stringify(beat), PRIVATE_ROOTS) ?? 'null')
    expect(one).toMatchObject({ s: 'W7', e: 'pageview', uid: 'u1', u: 'https://shotviva.com/pricing', r: 'https://shotviva.com/checkout', ft: { s: 'google', r: 'https://shotviva.com/join' } })
    expect(one.p.href).toBe('https://other.com/a')
    expect(JSON.stringify(one)).not.toMatch(/TOK|a@b\.co|session_id|code=/)
    const many = JSON.parse(scrubPvuvBody(JSON.stringify([beat, beat]), PRIVATE_ROOTS) ?? 'null')
    expect(many).toHaveLength(2)
    expect(many[1].u).toBe('https://shotviva.com/pricing')
  })
  it('refuses a body it cannot read', () => {
    expect(scrubPvuvBody('not json', PRIVATE_ROOTS)).toBeNull()
  })
})

describe('installPvuvScrub', () => {
  afterEach(() => resetPvuvScrubScrubGuard())
  function resetPvuvScrubScrubGuard() {
    resetPvuvScrubForTest()
  }

  it('cleans what goes to PVUV through sendBeacon and fetch and passes everything else through', async () => {
    const sent: Array<[string, unknown]> = []
    const realFetch = vi.fn(async (url: unknown, init?: RequestInit) => (sent.push([String(url), init?.body]), new Response(null)))
    const win = { fetch: realFetch as unknown as typeof fetch, navigator: { sendBeacon: (url: string | URL, data?: BodyInit | null) => (sent.push([String(url), data]), true) } }
    installPvuvScrub(win, PVUV_API, PRIVATE_ROOTS)
    const dirty = JSON.stringify({ e: 'pageview', u: 'https://shotviva.com/pricing?code=1' })
    win.navigator.sendBeacon(`${PVUV_API}/in`, dirty)
    await win.fetch(`${PVUV_API}/in`, { method: 'POST', body: dirty })
    await win.fetch('https://shotviva.com/api/x', { method: 'POST', body: dirty })
    await win.fetch(`${PVUV_API}/in`, { method: 'POST', body: 'garbage' })
    expect(sent[0]?.[1]).toBe(JSON.stringify({ e: 'pageview', u: 'https://shotviva.com/pricing' }))
    expect(sent[1]?.[1]).toBe(sent[0]?.[1])
    expect(sent[2]).toEqual(['https://shotviva.com/api/x', dirty])
    expect(sent).toHaveLength(3)
  })
})

describe('scrubFirstTouchCookie', () => {
  function fakeDoc(initial: string, host = 'www.shotviva.com') {
    const writes: string[] = []
    let jar = initial ? initial.split('; ') : []
    const doc = {
      location: { hostname: host, protocol: 'https:' },
      get cookie() { return jar.join('; ') },
      set cookie(value: string) {
        writes.push(value)
        const [pair = ''] = value.split(';')
        const name = pair.split('=')[0]
        jar = jar.filter((c) => c.split('=')[0] !== name)
        if (!/Max-Age=0/.test(value)) jar.push(pair)
      },
    }
    return { doc, writes }
  }
  const cookieOf = (touch: object) => `_pv_ft=${encodeURIComponent(JSON.stringify(touch))}`

  it('rewrites the stored referrer scrubbed, keeping name, path, domain, expiry and the other fields', () => {
    const { doc, writes } = fakeDoc(cookieOf({ s: 'google', r: 'https://shotviva.com/join/org/TOKEN?code=1#x' }))
    scrubFirstTouchCookie(doc, PRIVATE_ROOTS)
    const written = writes.find((w) => w.startsWith('_pv_ft='))
    expect(written).toBeDefined()
    const [pair, ...attrs] = (written ?? '').split('; ')
    expect(JSON.parse(decodeURIComponent((pair ?? '').slice('_pv_ft='.length)))).toEqual({ s: 'google', r: 'https://shotviva.com/join' })
    expect(attrs).toEqual(['Path=/', `Max-Age=${396 * 86400}`, 'SameSite=Lax', 'Domain=.shotviva.com', 'Secure'])
  })
  it('leaves a clean cookie, a missing one and a broken one alone', () => {
    for (const jar of [cookieOf({ r: 'https://chatgpt.com/' }), cookieOf({ s: 'x' }), '_pv_ft=%7Bbroken', '']) {
      const { doc, writes } = fakeDoc(jar)
      scrubFirstTouchCookie(doc, PRIVATE_ROOTS)
      expect(writes.filter((w) => w.startsWith('_pv_ft='))).toEqual([])
    }
  })
})

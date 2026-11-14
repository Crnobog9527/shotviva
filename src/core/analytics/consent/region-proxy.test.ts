import { NextRequest, NextResponse } from 'next/server'
import { describe, expect, it } from 'vitest'

import { REGION_COOKIE, TEST_COUNTRY_COOKIE } from './region'
import { withAnalyticsRegion } from './region-proxy'

type Visit = { country?: string; cookie?: string; query?: string; testOverride?: boolean }

function visit({ country, cookie, query = '', testOverride = false }: Visit) {
  const headers = new Headers()
  if (country) headers.set('x-vercel-ip-country', country)
  if (cookie) headers.set('cookie', cookie)
  const request = new NextRequest(`https://shotviva.com/pricing${query}`, { headers })
  const response = withAnalyticsRegion(NextResponse.next(), request, { testOverride })
  return { region: response.cookies.get(REGION_COOKIE), test: response.cookies.get(TEST_COUNTRY_COOKIE), setCookie: response.headers.get('set-cookie') }
}

describe('withAnalyticsRegion (T70)', () => {
  it('marks a visitor outside Europe as open, as a session cookie the page can read', () => {
    const { region, setCookie } = visit({ country: 'US' })
    expect(region?.value).toBe('open')
    expect(setCookie).toContain(`${REGION_COOKIE}=open`)
    expect(setCookie).not.toMatch(/HttpOnly|Max-Age|Expires/i)
  })

  it('writes nothing for a European or unknown visitor', () => {
    expect(visit({ country: 'DE' }).setCookie).toBeNull()
    expect(visit({}).setCookie).toBeNull()
  })

  it('removes the mark when the visitor is now in Europe', () => {
    const { region } = visit({ country: 'FR', cookie: `${REGION_COOKIE}=open` })
    expect(region?.value).toBe('')
  })

  it('sends no Set-Cookie when the mark is already right', () => {
    expect(visit({ country: 'CN', cookie: `${REGION_COOKIE}=open` }).setCookie).toBeNull()
  })

  it('outside production, ?sv_country= acts as that country and keeps it for the session', () => {
    const asGerman = visit({ country: 'US', query: '?sv_country=de', testOverride: true })
    expect(asGerman.region).toBeUndefined()
    expect(asGerman.test?.value).toBe('DE')
    const later = visit({ country: 'US', cookie: `${TEST_COUNTRY_COOKIE}=DE`, testOverride: true })
    expect(later.setCookie).toBeNull()
    const cleared = visit({ country: 'US', cookie: `${TEST_COUNTRY_COOKIE}=DE`, query: '?sv_country=', testOverride: true })
    expect(cleared.test?.value).toBe('')
    expect(cleared.region?.value).toBe('open')
  })

  it('production ignores the override', () => {
    const { region, test } = visit({ country: 'US', query: '?sv_country=DE', cookie: `${TEST_COUNTRY_COOKIE}=DE` })
    expect(region?.value).toBe('open')
    expect(test).toBeUndefined()
  })
})

describe('analyticsCookiesAllowed', () => {
  const at = (country: string, cookie?: string) =>
    new NextRequest('https://shotviva.com/', { headers: { 'x-vercel-ip-country': country, ...(cookie ? { cookie } : {}) } })
  it('follows the answer on the bar first, then the region', async () => {
    const { analyticsCookiesAllowed } = await import('./region-proxy')
    expect(analyticsCookiesAllowed(at('US'), { testOverride: false })).toBe(true)
    expect(analyticsCookiesAllowed(at('DE'), { testOverride: false })).toBe(false)
    expect(analyticsCookiesAllowed(at('DE', 'sv_analytics_consent=accepted'), { testOverride: false })).toBe(true)
    expect(analyticsCookiesAllowed(at('US', 'sv_analytics_consent=necessary'), { testOverride: false })).toBe(false)
  })
})

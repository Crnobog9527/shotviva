import { describe, expect, it, vi } from 'vitest'

import type { VitalReport } from './fields'
import { handleVitals, type VitalRow } from './record'
import { countryOf, parseVitalReport } from './schema'

vi.mock('../../auth/supabase-admin', () => ({
  createAdminSupabase: () => {
    throw new Error('the handler test must not reach the database')
  },
}))

const report: VitalReport = { metric: 'INP', value: 180, rating: 'good', route: 'generate', locale: 'en', nav: 'reload', standalone: false, sw: true, net: null }

function post(body: string, headers: Record<string, string> = {}) {
  return new Request('https://shotviva.com/api/vitals', { method: 'POST', body, headers: { 'content-type': 'text/plain', 'sec-fetch-site': 'same-origin', ...headers } })
}

function postWithout(name: string, headers: Record<string, string>) {
  const request = new Request('https://shotviva.com/api/vitals', { method: 'POST', body: JSON.stringify(report), headers: { 'content-type': 'text/plain', ...headers } })
  request.headers.delete(name)
  return request
}

describe('parseVitalReport', () => {
  it('accepts a real report', () => {
    expect(parseVitalReport(report)).toEqual(report)
    expect(parseVitalReport({ ...report, metric: 'CLS', value: 0.05, net: '3g' })).not.toBeNull()
  })

  it('rejects extra keys, bad enums and out-of-range values', () => {
    for (const bad of [
      { ...report, userId: 'u1' },
      { ...report, url: '/photos/abc' },
      { ...report, metric: 'FID' },
      { ...report, route: 'admin' },
      { ...report, locale: 'fr' },
      { ...report, nav: 'soft-navigation' },
      { ...report, net: '5g' },
      { ...report, value: -1 },
      { ...report, value: 120_001 },
      { ...report, metric: 'CLS', value: 101 },
      { ...report, value: '180' },
      { ...report, standalone: 'yes' },
      null,
      [],
      'x',
    ]) {
      expect(parseVitalReport(bad)).toBeNull()
    }
  })
})

describe('countryOf', () => {
  it('keeps a two-letter code only', () => {
    expect(countryOf('us')).toBe('US')
    expect(countryOf('CN')).toBe('CN')
    for (const bad of [null, '', 'XX', 'USA', '1A', 'C']) expect(countryOf(bad)).toBeNull()
  })
})

describe('handleVitals', () => {
  it('stores one checked row with the server-side country and answers 204', async () => {
    const insert = vi.fn<(row: VitalRow) => Promise<void>>().mockResolvedValue()
    const response = await handleVitals(post(JSON.stringify(report), { 'x-vercel-ip-country': 'de' }), insert)
    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    expect(insert).toHaveBeenCalledWith({
      metric: 'INP',
      value: 180,
      rating: 'good',
      route: 'generate',
      locale: 'en',
      nav_type: 'reload',
      standalone: false,
      sw: true,
      effective_type: null,
      country: 'DE',
    })
  })

  it('answers 204 and stores nothing for junk, oversize bodies and failed inserts', async () => {
    const insert = vi.fn<(row: VitalRow) => Promise<void>>().mockResolvedValue()
    for (const body of ['', 'not json', '{}', JSON.stringify({ ...report, email: 'a@b.c' }), JSON.stringify({ ...report, pad: 'x'.repeat(2000) })]) {
      expect((await handleVitals(post(body), insert)).status).toBe(204)
    }
    expect((await handleVitals(post(JSON.stringify(report), { 'content-length': '5000' }), insert)).status).toBe(204)
    expect(insert).not.toHaveBeenCalled()
    const failing = vi.fn<(row: VitalRow) => Promise<void>>().mockRejectedValue(new Error('down'))
    expect((await handleVitals(post(JSON.stringify(report)), failing)).status).toBe(204)
  })

  it('stores only reports from its own pages', async () => {
    const insert = vi.fn<(row: VitalRow) => Promise<void>>().mockResolvedValue()
    for (const site of ['cross-site', 'same-site', 'none']) {
      expect((await handleVitals(post(JSON.stringify(report), { 'sec-fetch-site': site, origin: 'https://shotviva.com' }), insert)).status).toBe(204)
    }
    // Without Sec-Fetch-Site, the Origin decides; no Origin at all is not ours either.
    for (const origin of ['https://evil.example', 'http://shotviva.com', 'https://shotviva.com.evil.example', 'null']) {
      expect((await handleVitals(postWithout('sec-fetch-site', { origin }), insert)).status).toBe(204)
    }
    await handleVitals(postWithout('sec-fetch-site', {}), insert)
    expect(insert).not.toHaveBeenCalled()
    await handleVitals(postWithout('sec-fetch-site', { origin: 'https://shotviva.com' }), insert)
    expect(insert).toHaveBeenCalledTimes(1)
  })

  it('reads only the body, its length, where it came from and the country, never a cookie', async () => {
    const request = post(JSON.stringify(report), { cookie: 'sb-access-token=secret', 'x-forwarded-for': '1.2.3.4', 'user-agent': 'UA' })
    const get = vi.spyOn(request.headers, 'get')
    const insert = vi.fn<(row: VitalRow) => Promise<void>>().mockResolvedValue()
    await handleVitals(request, insert)
    expect(get.mock.calls.map(([name]) => name.toLowerCase()).sort()).toEqual(['content-length', 'sec-fetch-site', 'x-vercel-ip-country'])
    expect(JSON.stringify(insert.mock.calls)).not.toMatch(/secret|1\.2\.3\.4|UA/)
  })
})

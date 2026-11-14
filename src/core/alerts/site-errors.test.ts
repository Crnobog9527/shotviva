import { describe, expect, it } from 'vitest'

import { renderAlert } from './templates'
import { areaOf, createErrorWindow, pathArea, sentryIssuesUrl, siteErrorsAlert } from './site-errors'

const T0 = Date.parse('2026-11-08T06:05:00Z')
const minute = 60_000

describe('which area an error belongs to', () => {
  it('reads request paths and API route names', () => {
    expect(pathArea('/api/webhooks/stripe')).toBe('payment')
    expect(pathArea('checkout')).toBe('payment')
    expect(pathArea('/zh/account/billing')).toBe('payment')
    expect(pathArea('/auth/callback')).toBe('auth')
    expect(pathArea('/zh/login')).toBe('auth')
    expect(pathArea('/api/auth/sms-hook')).toBe('auth')
    expect(pathArea('/zh/admin/orders')).toBe('admin')
    expect(pathArea('/api/generate/abc')).toBe('generate')
    expect(pathArea('/zh/pricing')).toBe('site')
  })

  it('skips generation failures (own alert) and warnings (the sender’s own failures)', () => {
    expect(areaOf({ source: 'capture', alert: 'generation_failed', level: 'error' })).toBeNull()
    expect(areaOf({ source: 'capture', alert: null, level: 'warning' })).toBeNull()
    expect(areaOf({ source: 'capture', alert: 'payment_webhook_failed', level: 'error' })).toBe('payment')
    expect(areaOf({ source: 'capture', alert: null, level: 'error' })).toBe('site')
    expect(areaOf({ source: 'api', route: 'webhooks/waffo' })).toBe('payment')
  })
})

describe('the 10-minute window: ≥ 10 in all, or ≥ 3 in payments or sign-in', () => {
  it('crosses at the 10th error anywhere', () => {
    const window = createErrorWindow()
    for (let i = 0; i < 9; i += 1) expect(window.record(i % 2 ? 'site' : 'generate', T0 + i * 1000)).toBeNull()
    expect(window.record('site', T0 + 9000)).toEqual({
      total: 10,
      byArea: { generate: 5, site: 5 },
      since: '2026-11-08T06:05:00.000Z',
      trigger: 'total',
    })
  })

  it('crosses at the 3rd payment or sign-in error', () => {
    const window = createErrorWindow()
    window.record('payment', T0)
    window.record('site', T0 + 1000)
    expect(window.record('payment', T0 + 2000)).toBeNull()
    expect(window.record('payment', T0 + 3000)).toMatchObject({ total: 4, trigger: 'payment' })
  })

  it('forgets errors older than 10 minutes', () => {
    const window = createErrorWindow()
    window.record('auth', T0)
    window.record('auth', T0 + minute)
    expect(window.record('auth', T0 + 11 * minute)).toBeNull()
  })

})

describe('the message', () => {
  const url = sentryIssuesUrl('acme', 'production')

  it('names the area, the count and since when (Beijing time), and links Sentry', () => {
    const alert = siteErrorsAlert({ total: 4, byArea: { payment: 3, site: 1 }, since: '2026-11-08T06:05:00.000Z', trigger: 'payment' }, url)
    const { sentence, link } = renderAlert(alert, { who: null, origin: 'https://shotviva.com', testSite: false })
    expect(`${sentence}\n${link}`).toBe(
      '【付款出错】过去 10 分钟服务器出错 4 次（北京时间 14:05 开始），出在：付款 3 次、网站页面 1 次。用户可能受影响，详情在 Sentry。\n去 Sentry 看：https://acme.sentry.io/issues/?environment=production&statsPeriod=1h',
    )
  })

  it('says 「网站报错偏多」 for a general spike, and falls back to sentry.io without the org', () => {
    const alert = siteErrorsAlert({ total: 12, byArea: { generate: 8, auth: 1, site: 3 }, since: '2026-11-08T06:05:00.000Z', trigger: 'total' }, sentryIssuesUrl(undefined, 'preview'))
    const { sentence, link } = renderAlert(alert, { who: null, origin: 'https://x', testSite: true })
    expect(sentence).toBe('（测试站）【网站报错偏多】过去 10 分钟服务器出错 12 次（北京时间 14:05 开始），出在：出图 8 次、网站页面 3 次、登录 1 次。用户可能受影响，详情在 Sentry。')
    expect(link).toBe('去 Sentry 看：https://sentry.io/issues/?environment=preview&statsPeriod=1h')
  })
})

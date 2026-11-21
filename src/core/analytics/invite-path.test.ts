import type { CaptureResult } from 'posthog-js'
import { describe, expect, it } from 'vitest'

import { scrubBreadcrumb, scrubEvent } from './sentry-scrub'
import { scrubCapture, scrubUrl } from './browser/posthog-config'
import { redactInvitePath } from '../invite-path'
import { redactString } from '../logger'

// An org invite link is a credential (ARCHITECTURE §6.5): it never reaches analytics, Sentry or logs.
const TOKEN = '0123456789abcdef0123456789abcdef'

describe('invite links in telemetry', () => {
  it('redacts the token in plain and URL-encoded paths', () => {
    expect(redactInvitePath(`/zh/join/org/${TOKEN}`)).toBe('/zh/join/org/[redacted]')
    expect(redactInvitePath(`/login?next=%2Fjoin%2Forg%2F${TOKEN}&x=1`)).toBe('/login?next=%2Fjoin%2Forg%2F[redacted]&x=1')
    expect(redactInvitePath('/account')).toBe('/account')
  })

  it('PostHog: $current_url, $pathname, referrers and a login next parameter', () => {
    expect(scrubUrl(`https://shotviva.com/join/org/${TOKEN}`)).toBe('https://shotviva.com/join/org/[redacted]')
    expect(scrubUrl(`https://shotviva.com/login?next=%2Fjoin%2Forg%2F${TOKEN}`)).not.toContain(TOKEN)
    const out = scrubCapture({ uuid: '1', event: '$pageview', properties: { $current_url: `https://shotviva.com/join/org/${TOKEN}`, $pathname: `/join/org/${TOKEN}`, $referrer: `https://shotviva.com/login?next=%2Fjoin%2Forg%2F${TOKEN}` } } as CaptureResult)
    expect(JSON.stringify(out)).not.toContain(TOKEN)
  })

  it('Sentry: request url, messages, breadcrumbs; and the server logger', () => {
    const event = scrubEvent({ type: undefined, message: `failed at /join/org/${TOKEN}`, request: { method: 'GET', url: `https://shotviva.com/join/org/${TOKEN}` }, breadcrumbs: [{ data: { url: `/join/org/${TOKEN}` } }] })
    expect(JSON.stringify(event)).not.toContain(TOKEN)
    expect(JSON.stringify(scrubBreadcrumb({ message: `navigate /join/org/${TOKEN}`, data: { to: `/join/org/${TOKEN}` } }))).not.toContain(TOKEN)
    expect(redactString(`GET /en/join/org/${TOKEN} 500`)).not.toContain(TOKEN)
  })
})

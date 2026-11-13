import { describe, expect, it } from 'vitest'

import { allowlistedUrl } from '@/core/partner/return-to'
import { site } from '@/site/site.config'

// Graylum's confirmed hosts: production apex and www, and the staging auth host.
describe('site.partners.graylum.returnToHosts', () => {
  const hosts = site.partners.graylum.returnToHosts

  it.each([
    'https://graylum.com/api/connectors/shotviva/callback',
    'https://www.graylum.com/api/connectors/shotviva/callback',
    'https://auth-staging.graylum.com/api/connectors/shotviva/callback',
  ])('accepts %s', (url) => {
    expect(allowlistedUrl(url, hosts)).not.toBeNull()
  })

  it('still rejects other Graylum subdomains', () => {
    expect(allowlistedUrl('https://staging.graylum.com/x', hosts)).toBeNull()
  })

  it('keeps the apex first, since the connect page links back to it', () => {
    expect(hosts[0]).toBe('graylum.com')
  })
})

// Reference images for /api/partner generate come only from these hosts (fetch-image.ts).
describe('site.partners.graylum.imageHosts', () => {
  const hosts = site.partners.graylum.imageHosts

  it.each([
    'https://www.graylum.com/uploads/a.jpg',
    'https://auth-staging.graylum.com/uploads/a.jpg',
    'https://graylum.com/uploads/a.jpg',
    'https://staging.graylum.com/uploads/a.jpg',
  ])('accepts %s', (url) => {
    expect(allowlistedUrl(url, hosts)).not.toBeNull()
  })

  it('still rejects other hosts and lookalikes', () => {
    expect(allowlistedUrl('https://evil.graylum.com/a.jpg', hosts)).toBeNull()
    expect(allowlistedUrl('https://www.graylum.com.evil.example/a.jpg', hosts)).toBeNull()
  })
})

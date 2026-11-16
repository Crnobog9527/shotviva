import { describe, expect, it, vi } from 'vitest'

import { indexingOpenNow } from '@/core/seo'
import { site } from '@/site/site.config'

import { GET } from './.well-known/ard.json/route'

vi.mock('@/core/seo', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/core/seo')>(),
  indexingOpenNow: vi.fn(),
}))

const { domain } = site.brand

function getManifest(host: string | null, indexingOpen: boolean) {
  vi.mocked(indexingOpenNow).mockReturnValue(indexingOpen)
  return GET(new Request(`https://${domain}/.well-known/ard.json`, {
    headers: host ? { host } : undefined,
  }))
}

describe('ARD manifest', () => {
  it('publishes a single entry for the existing public documentation on the canonical host', async () => {
    const response = getManifest(domain, true)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/ard+json')
    const { entries } = await response.json()
    expect(entries).toEqual([expect.objectContaining({
      identifier: `urn:air:${domain}:documentation`,
      url: `https://${domain}/llms.txt`,
      type: 'text/plain',
    })])
    expect(entries[0]).not.toHaveProperty('data')
  })

  it.each([
    [domain, false],
    ['preview.example.com', true],
    [null, true],
  ] as const)('publishes no resources for host %s with indexing %s', async (host, indexingOpen) => {
    const response = getManifest(host, indexingOpen)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ entries: [] })
  })
})

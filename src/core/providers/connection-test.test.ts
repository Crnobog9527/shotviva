import { describe, expect, it, vi } from 'vitest'

import { testConnection } from './connection-test'

const config = { baseUrl: 'https://relay.example.com/v1', apiKey: 'sk-test-key-123456' }

describe('testConnection', () => {
  it('sends GET {base_url}/models with the key and never follows redirects', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"data":[]}', { status: 200 }))
    await expect(testConnection(config, fetchImpl)).resolves.toEqual({ ok: true, status: 200 })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://relay.example.com/v1/models')
    expect(init.method).toBe('GET')
    expect(init.redirect).toBe('manual')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test-key-123456')
  })

  it('checks the current OpenRouter key without calling the image API', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 401 }))
    const router = { ...config, adapter: 'openrouter_images' } as const
    expect(await testConnection(router, fetchImpl)).toEqual({ ok: false, failure: 'unauthorized', status: 401 })
    expect(fetchImpl).toHaveBeenCalledWith(`${config.baseUrl}/key`, expect.objectContaining({ method: 'GET', redirect: 'manual' }))
  })

  it('reports a wrong key as unauthorized and keeps only the status', async () => {
    const body = JSON.stringify({ error: { message: 'Incorrect API key provided: sk-test-key-123456' } })
    const result = await testConnection(config, async () => new Response(body, { status: 401 }))
    expect(result).toEqual({ ok: false, failure: 'unauthorized', status: 401 })
    expect(JSON.stringify(result)).not.toContain('sk-test')
  })

  it('reports redirects, other statuses and network errors', async () => {
    await expect(testConnection(config, async () => new Response(null, { status: 302 }))).resolves.toMatchObject({ failure: 'redirect' })
    await expect(testConnection(config, async () => new Response('', { status: 404 }))).resolves.toMatchObject({ failure: 'http_error', status: 404 })
    await expect(
      testConnection(config, async () => {
        throw new TypeError('fetch failed')
      }),
    ).resolves.toEqual({ ok: false, failure: 'network' })
  })
})

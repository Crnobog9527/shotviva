import { describe, expect, it, vi } from 'vitest'

import { testConnection } from './connection-test'

const config = { baseUrl: 'https://relay.example.com/v1', apiKey: 'sk-test-key-123456' }

describe('testConnection', () => {
  it('sends GET {base_url}/models with the key and never follows redirects', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"data":[]}', { status: 200 }))
    await expect(testConnection(config, fetchImpl)).resolves.toMatchObject({ ok: true, status: 200 })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://relay.example.com/v1/models')
    expect(init.method).toBe('GET')
    expect(init.redirect).toBe('manual')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test-key-123456')
  })

  it('checks the current OpenRouter key without calling the image API', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 401 }))
    const router = { ...config, adapter: 'openrouter_images' } as const
    expect(await testConnection(router, fetchImpl)).toMatchObject({ ok: false, failure: 'unauthorized', status: 401 })
    expect(fetchImpl).toHaveBeenCalledWith(`${config.baseUrl}/key`, expect.objectContaining({ method: 'GET', redirect: 'manual' }))
  })

  it('reports a wrong key as unauthorized and keeps only the status', async () => {
    const body = JSON.stringify({ error: { message: 'Incorrect API key provided: sk-test-key-123456' } })
    const result = await testConnection(config, async () => new Response(body, { status: 401 }))
    expect(result).toMatchObject({ ok: false, failure: 'unauthorized', status: 401 })
    expect(JSON.stringify(result)).not.toContain('sk-test')
  })

  it('reports redirects, other statuses and network errors', async () => {
    await expect(testConnection(config, async () => new Response(null, { status: 302 }))).resolves.toMatchObject({ failure: 'redirect' })
    await expect(testConnection(config, async () => new Response('', { status: 404 }))).resolves.toMatchObject({ failure: 'http_error', status: 404 })
    await expect(
      testConnection(config, async () => {
        throw new TypeError('fetch failed')
      }),
    ).resolves.toMatchObject({ ok: false, failure: 'network' })
  })

  it('checks an Ark key and model with a request Ark rejects before generating, and times it', async () => {
    const ark = { baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', apiKey: 'ark-test-key-123456', adapter: 'ark_images', model: 'doubao-seedream-5-5-261028' } as const
    const fetchImpl = vi.fn(async () => Response.json({ error: { code: 'MissingParameter', message: 'prompt' } }, { status: 400 }))
    const result = await testConnection(ark, fetchImpl)
    expect(result).toMatchObject({ ok: true, status: 400 })
    expect(result.ms).toBeGreaterThanOrEqual(0)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${ark.baseUrl}/images/generations`)
    expect(init).toMatchObject({ method: 'POST', redirect: 'manual', body: JSON.stringify({ model: ark.model }) })
    const status = (code: string, s: number) => testConnection(ark, async () => Response.json({ error: { code } }, { status: s }))
    await expect(status('AuthenticationError', 401)).resolves.toMatchObject({ ok: false, failure: 'unauthorized' })
    await expect(status('OperationDenied.ServiceNotOpen', 403)).resolves.toMatchObject({ ok: false, failure: 'model_unavailable' })
    await expect(status('ModelNotOpen', 404)).resolves.toMatchObject({ ok: false, failure: 'model_unavailable' })
    await expect(status('ServerOverloaded', 400)).resolves.toMatchObject({ ok: false, failure: 'http_error' })
  })
})

import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createRelay, routeFor } from './relay.mjs'

const SECRET = 'a'.repeat(32)
let server: Server | undefined

afterEach(() => new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve())))

async function start(fetchImpl: typeof fetch): Promise<string> {
  const handle = createRelay({ secret: SECRET, fetchImpl, retryDelayMs: 1 })
  server = createServer((req, res) => void handle(req, res))
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`
}

function connectError(code: string): Error {
  return Object.assign(new TypeError('fetch failed'), { cause: { code } })
}

describe('routeFor', () => {
  it('allows only the two Ark calls behind the secret', () => {
    expect(routeFor('POST', `/${SECRET}/api/v3/images/generations`, SECRET)).toBe('images/generations')
    expect(routeFor('GET', `/${SECRET}/api/v3/models`, SECRET)).toBe('models')
    expect(routeFor('GET', `/${SECRET}/api/v3/images/generations`, SECRET)).toBeNull()
    expect(routeFor('POST', `/${SECRET}/api/v3/chat/completions`, SECRET)).toBeNull()
    expect(routeFor('POST', `/${'b'.repeat(32)}/api/v3/images/generations`, SECRET)).toBeNull()
    expect(routeFor('POST', '/api/v3/images/generations', SECRET)).toBeNull()
    expect(routeFor('POST', `/${SECRET}/api/v3/../v3/images/generations`, SECRET)).toBe('images/generations')
  })

  it('refuses a short secret', () => {
    expect(() => createRelay({ secret: 'short' })).toThrow()
  })
})

describe('relay', () => {
  it('forwards the body and the caller key, and returns Ark status and body', async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) =>
      new Response(JSON.stringify({ seen: (init.body as Buffer).toString() }), {
        status: 200, headers: { 'content-type': 'application/json', 'x-request-id': 'r1', 'set-cookie': 'x=1' },
      }))
    const base = await start(fetchImpl as unknown as typeof fetch)
    const res = await fetch(`${base}/${SECRET}/api/v3/images/generations`, {
      method: 'POST', headers: { authorization: 'Bearer k', 'content-type': 'application/json', cookie: 'c=1' }, body: '{"p":1}',
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ seen: '{"p":1}' })
    expect(res.headers.get('x-request-id')).toBe('r1')
    expect(res.headers.get('set-cookie')).toBeNull()
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://ark.cn-beijing.volces.com/api/v3/images/generations')
    expect(init.headers).toEqual({ authorization: 'Bearer k', 'content-type': 'application/json', accept: '*/*' })
  })

  it('passes Ark errors through unchanged', async () => {
    const base = await start((async () => new Response('{"error":{"code":"InvalidParameter"}}', { status: 400 })) as unknown as typeof fetch)
    const res = await fetch(`${base}/${SECRET}/api/v3/images/generations`, { method: 'POST', body: '{}' })
    expect(res.status).toBe(400)
    expect(await res.text()).toContain('InvalidParameter')
  })

  it('retries one connect failure, then succeeds', async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(connectError('UND_ERR_CONNECT_TIMEOUT'))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
    const base = await start(fetchImpl as unknown as typeof fetch)
    const res = await fetch(`${base}/${SECRET}/api/v3/models`)
    expect(res.status).toBe(200)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('does not retry a failure after the connection was made', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(connectError('ECONNRESET'))
    const base = await start(fetchImpl as unknown as typeof fetch)
    const res = await fetch(`${base}/${SECRET}/api/v3/images/generations`, { method: 'POST', body: '{}' })
    expect(res.status).toBe(502)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('404s anything outside the allow-list without calling Ark', async () => {
    const fetchImpl = vi.fn()
    const base = await start(fetchImpl as unknown as typeof fetch)
    expect((await fetch(`${base}/`)).status).toBe(404)
    expect((await fetch(`${base}/${SECRET}/api/v3/chat/completions`, { method: 'POST', body: '{}' })).status).toBe(404)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('relay timeout', () => {
  it('answers 504 RelayTimeout when Ark does not answer in time', async () => {
    const fetchImpl = vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(init.signal!.reason))
    }))
    const handle = createRelay({ secret: SECRET, fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 20 })
    server = createServer((req, res) => void handle(req, res))
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`
    const res = await fetch(`${base}/${SECRET}/api/v3/images/generations`, { method: 'POST', body: '{}' })
    expect(res.status).toBe(504)
    expect(await res.text()).toContain('RelayTimeout')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

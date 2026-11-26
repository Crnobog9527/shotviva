// Ark relay: a pass-through for Volcano Engine Ark (火山方舟, cn-beijing only), deployed in
// Volcano Engine's own network so the cross-border hop from Vercel lands on a gateway instead of
// on Ark directly. Shotviva points the Seedream provider row's base_url at
//   https://<relay host>/<RELAY_SECRET>/api/v3
// and nothing else changes: the caller's own Authorization header (the Ark key) is forwarded,
// the relay keeps no key of its own. Switching the row back to the Ark URL undoes it.
//
// Only two Ark calls pass: POST images/generations and GET models. Everything else is 404, so
// the URL is not an open proxy even to someone who learns it. No dependencies: Node 18+.

import { timingSafeEqual } from 'node:crypto'

export const ARK_ORIGIN = 'https://ark.cn-beijing.volces.com'
const ROUTES = new Map([['POST images/generations', true], ['GET models', true]])
const FORWARD_REQUEST = ['authorization', 'content-type', 'accept']
const FORWARD_RESPONSE = ['content-type', 'x-request-id', 'x-client-request-id']
// Connect-phase failures only: the body never reached Ark, so one more try cannot bill twice.
const CONNECT_FAILURES = new Set(['UND_ERR_CONNECT_TIMEOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'])
const MAX_BODY = 16 * 1024 * 1024
const UPSTREAM_TIMEOUT_MS = 170_000

function sameSecret(given, expected) {
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

function errorCode(error) {
  return error?.cause?.code ?? error?.code ?? error?.name ?? 'unknown'
}

function reply(res, status, code) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ error: { code, message: `relay: ${code}` } }))
}

async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) throw Object.assign(new Error('body too large'), { code: 'RelayBodyTooLarge' })
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

// Returns the Ark path ("images/generations") for an allowed request, else null.
export function routeFor(method, url, secret) {
  const path = new URL(url, 'http://relay').pathname
  const [given, ...rest] = path.slice(1).split('/')
  if (!given || !sameSecret(given, secret)) return null
  const tail = rest.join('/')
  if (!tail.startsWith('api/v3/')) return null
  const arkPath = tail.slice('api/v3/'.length)
  return ROUTES.has(`${method} ${arkPath}`) ? arkPath : null
}

export function createRelay({ secret, origin = ARK_ORIGIN, fetchImpl = fetch, retryDelayMs = 1_000 }) {
  if (typeof secret !== 'string' || secret.length < 24) throw new Error('RELAY_SECRET must be at least 24 characters')
  return async function handle(req, res) {
    const arkPath = routeFor(req.method ?? '', req.url ?? '/', secret)
    if (!arkPath) return reply(res, 404, 'RelayNotFound')
    let body
    try {
      body = req.method === 'POST' ? await readBody(req) : undefined
    } catch (error) {
      return reply(res, error?.code === 'RelayBodyTooLarge' ? 413 : 400, error?.code ?? 'RelayBadRequest')
    }
    const headers = {}
    for (const name of FORWARD_REQUEST) if (req.headers[name]) headers[name] = req.headers[name]
    let upstream
    for (let attempt = 0; ; attempt++) {
      try {
        upstream = await fetchImpl(`${origin}/api/v3/${arkPath}`, {
          method: req.method, headers, body, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        })
        break
      } catch (error) {
        const code = errorCode(error)
        if (attempt === 0 && CONNECT_FAILURES.has(code)) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
          continue
        }
        console.error(JSON.stringify({ msg: 'ark upstream failed', path: arkPath, code }))
        return reply(res, 502, `RelayUpstream_${code}`)
      }
    }
    const out = {}
    for (const name of FORWARD_RESPONSE) {
      const value = upstream.headers.get(name)
      if (value) out[name] = value
    }
    const payload = Buffer.from(await upstream.arrayBuffer())
    out['content-length'] = String(payload.length)
    res.writeHead(upstream.status, out)
    res.end(payload)
  }
}

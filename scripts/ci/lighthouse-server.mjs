/**
 * What Lighthouse CI measures (lighthouserc.json `startServerCommand`): `next start` behind an
 * HTTP/2 + brotli reverse proxy on https://localhost:3443, with a self-signed certificate made
 * at start.
 *
 * `next start` alone speaks HTTP/1.1 with gzip: six connections per host, so a page's stylesheets
 * and script chunks queue behind each other. Production (Vercel) serves the same build over
 * HTTP/2 with brotli, one multiplexed connection. Measured on the same build, 2026-11-11: mobile
 * performance 86–90 with LCP 3.6–4.1 s over HTTP/1.1, against 96 with LCP 2.7 s through this
 * proxy and 92–95 with LCP 2.7–3.2 s on production. The gate should judge what visitors get.
 *
 * Every request waits DELAY_MS before it is forwarded, a stand-in for one network round trip, so
 * subresources arrive after the document as they do on a real connection (on bare localhost they
 * arrive in the same millisecond, which changes what runs before the first paint).
 */
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import http from 'node:http'
import http2 from 'node:http2'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import zlib from 'node:zlib'

const UPSTREAM_PORT = 3000
const PORT = 3443
const DELAY_MS = 40
const COMPRESSIBLE = /text|javascript|json|xml|svg|x-component/
const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'content-length', 'content-encoding'])

function certificate() {
  const dir = mkdtempSync(join(tmpdir(), 'lhci-cert-'))
  const key = join(dir, 'key.pem')
  const cert = join(dir, 'cert.pem')
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '2', '-subj', '/CN=localhost'], { stdio: 'ignore' })
  return { key: readFileSync(key), cert: readFileSync(cert) }
}

function forward(stream, headers) {
  const upstreamHeaders = Object.fromEntries(Object.entries(headers).filter(([name]) => !name.startsWith(':')))
  upstreamHeaders.host = `localhost:${UPSTREAM_PORT}`
  // The proxy compresses, like the CDN in front of production; the app answers uncompressed.
  const brotli = /\bbr\b/.test(String(headers['accept-encoding'] ?? ''))
  upstreamHeaders['accept-encoding'] = 'identity'
  const request = http.request({ host: '127.0.0.1', port: UPSTREAM_PORT, method: headers[':method'], path: headers[':path'], headers: upstreamHeaders }, (response) => {
    if (stream.destroyed) return response.destroy()
    const compress = brotli && COMPRESSIBLE.test(String(response.headers['content-type'] ?? ''))
    const out = { ':status': response.statusCode }
    for (const [name, value] of Object.entries(response.headers)) if (!HOP_BY_HOP.has(name)) out[name] = value
    if (compress) out['content-encoding'] = 'br'
    stream.respond(out)
    if (!compress) return response.pipe(stream)
    // Flushed per chunk, so a streamed page's shell still leaves before its dynamic part.
    const encoder = zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 }, flush: zlib.constants.BROTLI_OPERATION_FLUSH })
    response.pipe(encoder).pipe(stream)
  })
  request.on('error', () => {
    if (stream.destroyed) return
    stream.respond({ ':status': 502 })
    stream.end()
  })
  stream.pipe(request)
}

async function upstreamReady() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const ok = await new Promise((resolve) => {
      const probe = http.get({ host: '127.0.0.1', port: UPSTREAM_PORT, path: '/' }, (response) => {
        response.resume()
        resolve(true)
      })
      probe.on('error', () => resolve(false))
    })
    if (ok) return
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`next start did not answer on port ${UPSTREAM_PORT}`)
}

const app = spawn('pnpm', ['start'], { stdio: 'inherit', env: { ...process.env, PORT: String(UPSTREAM_PORT) } })
const stop = () => app.kill('SIGTERM')
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
app.on('exit', (code) => process.exit(code ?? 0))

await upstreamReady()
const server = http2.createSecureServer(certificate())
server.on('stream', (stream, headers) => setTimeout(() => forward(stream, headers), DELAY_MS))
// lighthouserc.json waits for this line.
server.listen(PORT, () => process.stdout.write(`Lighthouse proxy ready on https://localhost:${PORT}\n`))

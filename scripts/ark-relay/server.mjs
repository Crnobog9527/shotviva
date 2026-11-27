// Entry point for the Volcano Engine function service (veFaaS) web app: listens on 0.0.0.0.
// Env: RELAY_SECRET (required, 24+ chars, the first path segment), PORT (default 8000).
import { createServer } from 'node:http'

import { createRelay } from './relay.mjs'

const handle = createRelay({ secret: process.env.RELAY_SECRET })
const server = createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.error(JSON.stringify({ msg: 'relay crashed', code: error?.code ?? error?.name }))
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' })
    res.end('{"error":{"code":"RelayInternal"}}')
  })
})
// Above the upstream timeout; keep-alive above common gateway idle timeouts (60 s) so the
// gateway never reuses a socket the relay already closed.
server.requestTimeout = 310_000
server.keepAliveTimeout = 75_000
server.headersTimeout = 76_000
server.listen(Number(process.env.PORT ?? 8000), '0.0.0.0')

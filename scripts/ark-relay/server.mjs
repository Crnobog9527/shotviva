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
server.requestTimeout = 180_000
server.listen(Number(process.env.PORT ?? 8000), '0.0.0.0')

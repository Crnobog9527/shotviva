// Serves the production build on :3100 through Next's programmatic API. Same server as
// `next start`, under a process name (`node loadtest/run/serve.mjs`) that other tooling's
// `pkill -f "next start"` clean-ups do not match during a long run.
import { createServer } from 'node:http'

import next from 'next'

const port = Number(process.env.PORT ?? 3100)
const app = next({ dev: false, dir: process.cwd(), port, hostname: 'localhost' })
const handle = app.getRequestHandler()
await app.prepare()
createServer((req, res) => handle(req, res)).listen(port, () => console.log(`load-test app on http://localhost:${port}`))

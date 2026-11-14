// With an authenticated Vercel CLI, run: node scripts/analytics/refresh-edge-snapshot.mjs [UTC end].
// Reads only aggregate metrics. The output is private operational data in git-ignored .local/.
import { execFileSync } from 'node:child_process'
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { edgeWindow, queryEdge } from '../../src/core/admin/analytics/edge-query.ts'

const input = process.argv[2]
if (input && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(input)) {
  throw new Error('Use an ISO UTC timestamp ending in Z.')
}
const end = (input ? new Date(input) : new Date(Math.floor(Date.now() / 60_000) * 60_000)).toISOString()
if (Date.parse(end) > Date.now()) throw new Error('The observation cannot end in the future.')
const window = edgeWindow('7d', Date.parse(end))
if (input && window.end !== end) throw new Error('Choose a closed UTC hour for the snapshot end.')
function request(endpoint, body) {
  const args = ['api', endpoint]
  if (body) args.push('--input', '-')
  // Never print CLI output or CLI errors; even a failed project response can contain metadata.
  try {
    const out = execFileSync('vercel', args, {
      input: body ? JSON.stringify(body) : undefined, encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'], timeout: 45_000, maxBuffer: 32 * 1024 * 1024,
    })
    return JSON.parse(out)
  } catch { throw new Error('Vercel did not return the requested data.') }
}
const { id: projectId, accountId: ownerId } = request('/v9/projects/shotviva')
if (!projectId || !ownerId) throw new Error('Missing Vercel project scope.')
const snapshot = await queryEdge((body) => request('/v2/observability/query', body), { ownerId, projectId }, window, true)
const folder = new URL('../../.local/traffic-source-qa/', import.meta.url)
mkdirSync(folder, { recursive: true, mode: 0o700 })
const target = new URL('edge-snapshot.json', folder)
const tmp = new URL(`${target.href}.${process.pid}.tmp`)
writeFileSync(tmp, JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
renameSync(tmp, target)

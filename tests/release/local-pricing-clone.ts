import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'

// The release commits a database-wide version. Other suites and local QA must never see it.
export function cloneLocalPricingDb() {
  const status = execFileSync('supabase', ['status', '-o', 'env'], { encoding: 'utf8' })
  const url = new URL(/^DB_URL="([^"]+)"$/m.exec(status)?.[1] ?? '')
  if (url.hostname !== '127.0.0.1' || url.pathname !== '/postgres') throw new Error('Expected local Supabase')
  const container = execFileSync('docker', ['ps', '--filter', 'label=com.supabase.cli.project',
    '--filter', 'publish=' + url.port, '--format', '{{.Names}}'], { encoding: 'utf8' }).trim()
  if (!/^supabase_db_[\w.-]+$/.test(container)) throw new Error('Expected exactly one local Supabase DB')
  const name = 'pricing_test_' + randomUUID().replaceAll('-', '')
  const docker = (...args: string[]) => execFileSync('docker', ['exec', container, ...args], { stdio: 'inherit' })
  const drop = () => docker('dropdb', '-U', 'supabase_admin', '--force', name)
  docker('createdb', '-U', 'supabase_admin', '-T', 'template0', name)
  try {
    docker('bash', '-euo', 'pipefail', '-c',
      'pg_dump -U supabase_admin -Fc postgres | pg_restore -U supabase_admin --exit-on-error -d "$1"', 'restore', name)
  } catch (error) {
    drop()
    throw error
  }
  url.pathname = '/' + name
  return { connect: async () => {
    const db = new Client({ connectionString: url.href })
    await db.connect()
    return db
  }, drop }
}

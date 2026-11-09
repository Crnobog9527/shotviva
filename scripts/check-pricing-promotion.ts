import { createAdminSupabase } from '../src/core/auth/supabase-admin'
import { readActivePricing } from '../src/core/billing/active-pricing'
import { publicEnv } from '../src/core/public-env'

async function main() {
  const [candidate, target] = process.argv.slice(2)
  if (!candidate || !['v1', 'v2'].includes(target)) throw new Error('Usage: pnpm pricing:prepromote <candidate-url> <v1|v2>')
  const url = new URL('/api/pricing-version', candidate)
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error('Could not read candidate build metadata')
  const build = await response.json()
  const databaseHost = new URL(publicEnv.NEXT_PUBLIC_SUPABASE_URL).host
  if (build.databaseHost !== databaseHost || build.version !== target) {
    throw new Error('Candidate DB host or build version does not match the release target')
  }
  const active = await readActivePricing(createAdminSupabase()) ?? 'v1'
  if (active !== target) throw new Error(`Database catalogue is ${active}, promotion requires ${target}`)
  console.log(`Promotion check passed for ${url.host}, ${databaseHost}, ${target}`)
}
main().catch((error: Error) => {
  console.error(error.message)
  process.exitCode = 1
})

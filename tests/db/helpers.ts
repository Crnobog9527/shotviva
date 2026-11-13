import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

import { Client } from 'pg'

import type { RpcClient } from '@/core/billing'

type LocalSupabase = { dbUrl: string; apiUrl: string; serviceRoleKey: string; anonKey: string }

// Explicit env wins (CI or a non-default local stack); otherwise ask the CLI for the
// running local stack's values, so `pnpm test:db` works right after `supabase start`.
function readStatus(): Record<string, string> {
  const output = execSync('supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  return Object.fromEntries(
    output
      .split('\n')
      .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter((match): match is RegExpMatchArray => match !== null)
      .map((match) => [match[1], match[2]]),
  )
}

let cached: LocalSupabase | undefined

export function localSupabase(): LocalSupabase {
  if (cached) return cached
  const env = process.env
  const status = env.SUPABASE_SERVICE_ROLE_KEY ? {} : readStatus()
  const pick = (envKey: string, statusKey: string) => {
    const value = env[envKey] ?? status[statusKey]
    if (!value) throw new Error(`Missing ${envKey}; run supabase start`)
    return value
  }
  cached = {
    dbUrl: pick('SUPABASE_DB_URL', 'DB_URL'),
    apiUrl: pick('SUPABASE_URL', 'API_URL'),
    serviceRoleKey: pick('SUPABASE_SERVICE_ROLE_KEY', 'SERVICE_ROLE_KEY'),
    anonKey: pick('SUPABASE_ANON_KEY', 'ANON_KEY'),
  }
  return cached
}

// Real PostgREST calls, so grants and RLS are exercised exactly as the app will hit them.
export function restClient(key: string): RpcClient & { select(table: string): Promise<Response> } {
  const { apiUrl } = localSupabase()
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
  return {
    async rpc(fn, args) {
      const response = await fetch(`${apiUrl}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(args),
      })
      const body: unknown = await response.json()
      if (response.ok) return { data: body, error: null }
      const error = body as { message?: string; code?: string }
      return { data: null, error: { message: error.message ?? 'unknown', code: error.code } }
    },
    select(table) {
      return fetch(`${apiUrl}/rest/v1/${table}?select=*`, { headers })
    },
  }
}

export const serviceClient = () => restClient(localSupabase().serviceRoleKey)
export const anonClient = () => restClient(localSupabase().anonKey)

export async function connectAdmin(): Promise<Client> {
  const client = new Client({ connectionString: localSupabase().dbUrl })
  await client.connect()
  return client
}

// Balances to start a test user with: credits is the paid pool, freeCredits the free pool.
export type TestProfile = { credits?: number; freeCredits?: number; paidUntil?: Date | null }

// Inserting into auth.users fires the profiles trigger, like a real signup.
export async function createUser(db: Client, profile: TestProfile = {}) {
  const id = randomUUID()
  await db.query(
    "insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')",
    [id, `t2-${id}@example.test`],
  )
  await setBalances(db, id, profile)
  return id
}

export async function setBalances(db: Client, id: string, profile: TestProfile) {
  await db.query('update public.profiles set credits = $2, free_credits = $3, paid_until = $4 where id = $1', [
    id,
    profile.credits ?? 0,
    profile.freeCredits ?? 0,
    profile.paidUntil ?? null,
  ])
}

export async function profileOf(db: Client, id: string) {
  const { rows } = await db.query<{
    credits: number
    free_credits: number
    paid_until: Date | null
    banned_at: Date | null
  }>(
    'select credits, free_credits, paid_until, banned_at from public.profiles where id = $1',
    [id],
  )
  const row = rows[0]
  if (!row) throw new Error(`no profile ${id}`)
  return row
}

export async function ledgerOf(db: Client, id: string) {
  const { rows } = await db.query<{ kind: string; pool: string; delta: number; idempotency_key: string }>(
    'select kind, pool, delta, idempotency_key from public.credit_ledger where user_id = $1 order by id',
    [id],
  )
  return rows
}

export const DAY_MS = 24 * 60 * 60 * 1000

// Publish seeded fixtures under the same database gates as the admin action.
export async function publishFixture(db: Client, ...ids: string[]) {
  await approveFixtures(db, ...ids)
  await db.query('update public.templates set is_active=true where id=any($1)',[ids])
}

export async function approveFixtures(db: Client, ...ids: string[]) {
  await db.query('insert into public.template_sale_approvals(template_id,enabled) select unnest($1::text[]),true on conflict(template_id) do update set enabled=true',[ids])
}

// A published template with an explicit per-resolution price, for tests that need a specific
// charge (reserve_credits reads the price from the template, never from the caller).
export async function createPricedTemplate(
  db: Client,
  // Raw SQL fixture: 3k (the name before migration 1431) is stored as 4k by the table's trigger.
  cost: Record<string, number> = { '1k': 1, '2k': 2, '4k': 3 },
  quality: 'high' | 'medium' = 'medium',
) {
  const id = `t16-${randomUUID().slice(0, 8)}`
  await db.query(
    `insert into public.templates (id, name, category, fields, quality, credits_cost, is_active, visible_in)
     values ($1, 'T16 priced', 'pets', $2, $3, $4, false, array['web', 'partner'])`,
    [id, JSON.stringify({ images: { min: 0, max: 1 }, copy: [], aspectRatios: ['1:1'] }), quality, JSON.stringify(cost)],
  )
  await publishFixture(db, id)
  return id
}

// Local GoTrue times out under heavy load; retry Auth API calls a few times.
export async function retryAuth<T>(work: () => Promise<T>, tries = 5): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await work()
    } catch (error) {
      if (attempt >= tries) throw error
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt))
    }
  }
}

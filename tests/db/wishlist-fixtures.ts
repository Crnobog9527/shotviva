import { randomUUID } from 'node:crypto'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Client } from 'pg'

import { applyPurchase } from '@/core/billing'
import { newInputKey } from '@/core/storage'
import type { WishlistDeps } from '@/core/wishlist'

import { createMemoryStore } from '../fakes/memory-store'
import { jpeg } from '../fakes/images'
import { localSupabase, serviceClient } from './helpers'
import { serviceSupabase } from './supabase-env'

const options = { auth: { persistSession: false, autoRefreshToken: false } }
const PASSWORD = `pw-${randomUUID()}`

export type WishlistUser = { id: string; email: string }

type UserOptions = { eligible?: boolean; fullName?: string; session?: boolean }

// A test account, optionally with a Google-style display name and a succeeded generation (the
// §15.1 threshold). session: true creates it through Auth with a password, so signedIn() can
// read the wall through RLS with a real session; everyone else is a direct auth.users row
// (fires the same profiles trigger, without Auth's password hashing).
export async function wishlistUser(db: Client, opts: UserOptions = {}): Promise<WishlistUser> {
  const email = `t12-${randomUUID()}@example.test`
  const metadata: Record<string, string> = opts.fullName ? { full_name: opts.fullName } : {}
  const id = opts.session ? await authUser(email, metadata) : randomUUID()
  if (!opts.session) {
    await db.query(
      "insert into auth.users (id, email, aud, role, raw_user_meta_data) values ($1, $2, 'authenticated', 'authenticated', $3)",
      [id, email, JSON.stringify(metadata)],
    )
  }
  if (opts.eligible ?? true) await succeededJob(db, id)
  return { id, email }
}

// Auth answers a retryable timeout when the machine is busy (password hashing); retry those.
// supabase-js both returns and throws it, depending on the call.
async function withAuthRetry<T extends { error: { name?: string } | null }>(call: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const result = await call()
      if (result.error?.name !== 'AuthRetryableFetchError' || attempt === 3) return result
    } catch (error) {
      if ((error as { name?: string }).name !== 'AuthRetryableFetchError' || attempt === 3) throw error
    }
  }
}

async function authUser(email: string, metadata: Record<string, string>): Promise<string> {
  const { data, error } = await withAuthRetry(() =>
    serviceSupabase().auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: metadata }),
  )
  if (error || !data.user) throw error ?? new Error('createUser returned no user')
  return data.user.id
}

export async function succeededJob(db: Client, userId: string, status: 'succeeded' | 'failed' = 'succeeded') {
  const id = randomUUID()
  await db.query(
    `insert into public.generation_jobs
       (id, user_id, module, template_id, source, status, visibility, credits_cost, output_key, error_code, finished_at, credit_pool)
     values ($1, $2, 'image', 'freeform', 'web', $3, 'public', 2, $4, $5, now(), 'free')`,
    [id, userId, status, status === 'succeeded' ? `outputs/${userId}/${id}.png` : null, status === 'failed' ? 'X' : null],
  )
}

// A real membership purchase, the way the Stripe webhook records it, so T9's current_tier()
// answers 'max' (or 'pro'): the latest membership in the ledger while paid_until > now().
export async function buyTier(userId: string, tier: 'max' | 'pro') {
  await applyPurchase(serviceClient(), { userId, productId: `${tier}_monthly`, eventId: `cs_${randomUUID()}` })
}

export const makeMax = (userId: string) => buyTier(userId, 'max')

// The membership window has passed: current_tier() is null again.
export async function dropTier(db: Client, userId: string) {
  await db.query("update public.profiles set paid_until = now() - interval '1 day' where id = $1", [userId])
}

export async function signedIn(user: WishlistUser): Promise<SupabaseClient> {
  const { apiUrl, anonKey } = localSupabase()
  const client = createClient(apiUrl, anonKey, options)
  const { error } = await withAuthRetry(() => client.auth.signInWithPassword({ email: user.email, password: PASSWORD }))
  if (error) throw error
  return client
}

export function wishlistDeps() {
  const memory = createMemoryStore()
  const deps: WishlistDeps = { db: serviceSupabase(), store: memory.store }
  return { deps, memory }
}

// What the browser does through /api/uploads: a JPEG PUT under the user's inputs/ prefix.
export async function uploadInput(memory: ReturnType<typeof createMemoryStore>, userId: string, opts: { exif?: boolean } = {}) {
  const key = newInputKey(userId, 'image/jpeg')
  memory.upload(key, await jpeg(64, 48, opts), 'image/jpeg')
  return key
}

export async function requestRow(db: Client, id: string) {
  const { rows } = await db.query<{ status: string; image_keys: string[]; votes_count: number; template_id: string | null; author_label: string }>(
    'select status, image_keys, votes_count, template_id, author_label from public.template_requests where id = $1',
    [id],
  )
  return rows[0] ?? null
}

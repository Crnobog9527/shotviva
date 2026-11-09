import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

import { accountPrefixes } from '../../src/core/auth/account-deletion'
import type { QaEnv } from './env'
import type { Persona } from './personas'
import type { QaStorage } from './storage'

export function adminClient(env: QaEnv): SupabaseClient {
  return createClient(env.supabaseUrl, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

const TRANSIENT = /timed out|unexpected error|fetch failed|ECONNRESET|50[234]/i

// Auth Admin calls can time out on a busy project; a read or a create that never happened is
// safe to repeat. Anything else surfaces at once.
export async function retryTransient<T extends { error: { message: string } | null }>(
  call: () => Promise<T>,
  attempts = 4,
  delayMs = 2000,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const result = await call()
    if (!result.error || attempt >= attempts || !TRANSIENT.test(result.error.message)) return result
    await new Promise((resolve) => setTimeout(resolve, delayMs * attempt))
  }
}

// The Admin API has no lookup by email; the preview project is small, so page through.
export async function findUserByEmail(db: SupabaseClient, email: string): Promise<User | null> {
  const perPage = 1000
  for (let page = 1; ; page++) {
    const { data, error } = await retryTransient(() => db.auth.admin.listUsers({ page, perPage }))
    if (error) throw new Error(`listUsers failed: ${error.message}`)
    const found = data.users.find((user) => user.email?.toLowerCase() === email)
    if (found) return found
    if (data.users.length < perPage) return null
  }
}

// Confirmed and passwordless: no confirmation email, and the only way in is a link from
// `pnpm qa:login`. The trigger handle_new_user creates the profile row.
export async function createPersonaUser(db: SupabaseClient, persona: Persona): Promise<User> {
  const { data, error } = await retryTransient(() =>
    db.auth.admin.createUser({ email: persona.email, email_confirm: true, user_metadata: { qa_persona: persona.id } }),
  )
  if (data.user) return data.user
  // A timed-out attempt may still have created the user before the retry.
  const existing = /already/i.test(error?.message ?? '') ? await findUserByEmail(db, persona.email) : null
  if (existing && (persona.id !== 'qa-invitee' || existing.user_metadata.qa_persona === persona.id)) return existing
  throw new Error(`createUser ${persona.id} failed: ${error?.message ?? 'no user'}`)
}

// Same order as the app's account deletion (core/auth/account-deletion.ts): files first,
// then the auth user, which cascades to the profile, ledger and works.
export async function deletePersonaUser(db: SupabaseClient, storage: QaStorage, userId: string): Promise<void> {
  for (const prefix of accountPrefixes(userId)) await storage.deletePrefix(prefix)
  const { error } = await retryTransient(() => db.auth.admin.deleteUser(userId))
  // Not found after a retry means the timed-out attempt went through.
  if (error && !/not found/i.test(error.message)) throw new Error(`deleteUser failed: ${error.message}`)
}

import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'

import { exchangeLinkCode, issueLinkCode, type PartnerRouteDeps } from '@/core/partner'
import type { ObjectStore } from '@/core/storage'

import { createMemoryStore } from '../fakes/memory-store'
import { serviceSupabase } from './supabase-env'

// Shared set-up for the partner API DB tests (AGENTS §7 item 7): real local Supabase,
// in-memory R2, requests built the way Graylum's server sends them.

export const PREVIEW_KEY = `sv_test_${'k'.repeat(40)}`
export const PRODUCTION_KEY = `sv_live_${'p'.repeat(40)}`
export const previewEnv = { GRAYLUM_PARTNER_KEY: PREVIEW_KEY, VERCEL_ENV: 'preview' as const }
export const productionEnv = { GRAYLUM_PARTNER_KEY: PRODUCTION_KEY, VERCEL_ENV: 'production' as const }

export const ORIGIN = 'https://shotviva.test'
export const partnerConfig = {
  returnToHosts: ['graylum.com', 'auth-staging.graylum.com'],
  connectCallbackPath: '/api/connectors/shotviva/callback' as const,
  imageHosts: ['img.graylum.com'],
}

export function routeDeps(store: ObjectStore = createMemoryStore().store): PartnerRouteDeps {
  return { db: serviceSupabase(), store, env: previewEnv, origin: ORIGIN, config: partnerConfig }
}

type RequestOptions = {
  method?: 'GET' | 'POST'
  key?: string | null
  account?: string
  idempotencyKey?: string
  body?: unknown
}

export function partnerRequest(path: string, options: RequestOptions = {}): Request {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  const key = options.key === undefined ? PREVIEW_KEY : options.key
  if (key) headers.set('Authorization', `Bearer ${key}`)
  if (options.account) headers.set('X-Shotviva-Account', options.account)
  if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey)
  return new Request(`${ORIGIN}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
}

type Profile = { credits?: number; paidUntil?: Date | null }

// Through the Auth admin API rather than a raw auth.users insert, so /link's display-name
// lookup (auth.admin.getUserById) sees a real user.
export async function createUser(db: Client, profile: Profile = {}): Promise<string> {
  const { data, error } = await serviceSupabase().auth.admin.createUser({
    email: `t7-${randomUUID()}@example.test`,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`)
  await db.query('update public.profiles set credits = $2, paid_until = $3 where id = $1', [
    data.user.id,
    profile.credits ?? 0,
    profile.paidUntil ?? null,
  ])
  return data.user.id
}

// A user who went through connect → allow → /link.
export async function linkedUser(db: Client, profile: Profile = { credits: 3 }) {
  const userId = await createUser(db, profile)
  const code = await issueLinkCode(serviceSupabase(), userId)
  await exchangeLinkCode(serviceSupabase(), code)
  return userId
}

export async function linkRow(db: Client, userId: string) {
  const { rows } = await db.query<{ link_code: string | null; linked_at: Date | null; revoked_at: Date | null }>(
    'select link_code, linked_at, revoked_at from public.partner_links where user_id = $1',
    [userId],
  )
  return rows[0] ?? null
}

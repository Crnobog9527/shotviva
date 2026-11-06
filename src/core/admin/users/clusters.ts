import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'

// 「可疑注册」 (ARCHITECTURE §10): admin_signup_ip_clusters (0183) groups the window's signups
// (profiles_created_at_idx) by signup_ip and keeps IPs with 3 or more accounts.

export const CLUSTER_WINDOWS = [1, 7] as const
export type ClusterWindow = (typeof CLUSTER_WINDOWS)[number]

export type ClusterMember = {
  id: string
  email: string | null
  createdAt: string
  freeCredits: number
  freeUsed: number
  bannedAt: string | null
}

export type SignupCluster = { ip: string; accounts: number; lastSignupAt: string; members: ClusterMember[] }

const memberSchema = z.object({
  id: z.uuid(),
  email: z.string().nullable(),
  created_at: z.string(),
  free_credits: z.number(),
  free_used: z.number(),
  banned_at: z.string().nullable(),
})

const rowSchema = z.object({
  signup_ip: z.string(),
  accounts: z.number(),
  last_signup_at: z.string(),
  members: memberSchema.array(),
})

export function parseClusterWindow(raw: unknown): ClusterWindow {
  return raw === '7' ? 7 : 1
}

export async function listSignupClusters(db: SupabaseClient, days: ClusterWindow): Promise<SignupCluster[]> {
  const { data, error } = await db.rpc('admin_signup_ip_clusters', { p_days: days })
  if (error) throw new AppError('INTERNAL', 'signup clusters failed', { cause: new Error(error.message) })
  return rowSchema.array().parse(data).map((row) => ({
    ip: row.signup_ip,
    accounts: row.accounts,
    lastSignupAt: row.last_signup_at,
    members: row.members.map((member) => ({
      id: member.id,
      email: member.email,
      createdAt: member.created_at,
      freeCredits: member.free_credits,
      freeUsed: member.free_used,
      bannedAt: member.banned_at,
    })),
  }))
}

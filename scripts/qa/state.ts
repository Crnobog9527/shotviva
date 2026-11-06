import type { SupabaseClient } from '@supabase/supabase-js'

import { currentTier, readProfile } from './ledger'
import type { Persona } from './personas'
import type { Outcome } from './setup-persona'

export type StateRow = {
  persona: string
  email: string
  role: string
  tier: string
  free: number
  paid: number
  paidUntil: string
  works: number
  ledger: number
  banned: string
}

// Counts only (head requests): generation_jobs_user_id_created_at_idx and
// credit_ledger_user_id_created_at_idx both lead with user_id.
async function count(db: SupabaseClient, table: string, userId: string, succeededOnly: boolean): Promise<number> {
  let query = db.from(table).select('id', { count: 'exact', head: true }).eq('user_id', userId)
  if (succeededOnly) query = query.eq('status', 'succeeded')
  const { count: n, error } = await query
  if (error) throw new Error(`${table} count failed: ${error.message}`)
  return n ?? 0
}

export async function readState(db: SupabaseClient, persona: Persona, userId: string): Promise<StateRow> {
  const profile = await readProfile(db, userId)
  return {
    persona: persona.id,
    email: persona.email,
    role: profile.role,
    tier: (await currentTier(db, userId)) ?? '-',
    free: profile.free_credits,
    paid: profile.credits,
    paidUntil: profile.paid_until ? profile.paid_until.slice(0, 10) : '-',
    works: await count(db, 'generation_jobs', userId, true),
    ledger: await count(db, 'credit_ledger', userId, false),
    banned: profile.banned_at ? 'yes' : 'no',
  }
}

const COLUMNS: (keyof StateRow)[] = ['persona', 'email', 'role', 'tier', 'free', 'paid', 'paidUntil', 'works', 'ledger', 'banned']

export function formatTable(rows: (StateRow & { action: Outcome })[]): string {
  const header = [...COLUMNS, 'action'] as const
  const cells = rows.map((row) => header.map((col) => String(row[col])))
  const widths = header.map((col, i) => Math.max(col.length, ...cells.map((line) => line[i].length)))
  const line = (values: readonly string[]) => values.map((v, i) => v.padEnd(widths[i])).join('  ').trimEnd()
  return [line(header), line(widths.map((w) => '-'.repeat(w))), ...cells.map(line)].join('\n')
}

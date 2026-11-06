import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'

// The overview 「待处理」 strip (ARCHITECTURE §10, T26): admin_todo_counts (0189), one call, each
// count on its own index (see the migrations). T27 (0224) added open_tickets.

const window = z.object({ total: z.number(), failed: z.number() })

const todoSchema = z.object({
  stuck_jobs: z.number(),
  jobs_1h: window,
  jobs_24h: window,
  pending_requests: z.number(),
  payment_issues: z.number(),
  last_purchase_at: z.string().nullable(),
  provider: z.object({ label: z.string(), model: z.string() }).nullable(),
  open_tickets: z.number(),
})

export type TodoCounts = {
  stuckJobs: number
  failures1h: z.infer<typeof window>
  failures24h: z.infer<typeof window>
  pendingRequests: number
  paymentIssues: number
  lastPurchaseAt: string | null
  provider: { label: string; model: string } | null
  openTickets: number
}

export async function loadTodoCounts(db: SupabaseClient): Promise<TodoCounts> {
  const { data, error } = await db.rpc('admin_todo_counts')
  if (error) throw new AppError('INTERNAL', 'admin_todo_counts failed', { cause: new Error(error.message) })
  const row = todoSchema.parse(data)
  return {
    stuckJobs: row.stuck_jobs,
    failures1h: row.jobs_1h,
    failures24h: row.jobs_24h,
    pendingRequests: row.pending_requests,
    paymentIssues: row.payment_issues,
    lastPurchaseAt: row.last_purchase_at,
    provider: row.provider,
    openTickets: row.open_tickets,
  }
}

import 'server-only'

import { z } from 'zod'

import { callRpc, type RpcClient } from '@/core/billing'
import { disputeRowSchema, toLive, type DisputeRow, type LiveDispute, type StripeApi } from '@/core/billing/stripe'

import { decodeCursor, encodeCursor, PAGE_SIZE, type Page } from '../cursor'

// /admin/disputes (ARCHITECTURE §6.3 「后台拒付页」, T82): our rows from admin_list_disputes
// (0729, (created_at, id) cursor) joined with Stripe's live status. Stripe is asked once per page
// (disputes.list, newest 100): the status, deadline and staged evidence live there, and a
// dispute answered in the Stripe Dashboard shows as such here too.

export type DisputeListItem = DisputeRow & { live: LiveDispute | null }

export async function listDisputes(deps: { db: RpcClient; stripe: StripeApi }, rawCursor: string | null): Promise<Page<DisputeListItem>> {
  const cursor = decodeCursor(rawCursor)
  const rows = await callRpc(
    deps.db,
    'admin_list_disputes',
    { p_cursor_at: cursor?.c ?? null, p_cursor_id: cursor?.i ?? null, p_limit: PAGE_SIZE + 1 },
    z.array(disputeRowSchema),
  )
  const live = rows.length > 0 ? await liveById(deps.stripe) : new Map<string, LiveDispute>()
  const items = rows.slice(0, PAGE_SIZE).map((row) => ({ ...row, live: live.get(row.stripe_dispute_id) ?? null }))
  const last = items.at(-1)
  const nextCursor = rows.length > PAGE_SIZE && last ? encodeCursor({ created_at: last.created_at.toISOString(), id: last.stripe_dispute_id }) : null
  return { items, nextCursor }
}

async function liveById(stripe: StripeApi): Promise<Map<string, LiveDispute>> {
  const { data } = await stripe.disputes.list({ limit: 100 })
  return new Map(data.map((dispute) => [dispute.id, toLive(dispute)]))
}

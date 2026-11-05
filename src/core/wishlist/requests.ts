import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '../errors'
import type { ObjectStore } from '../storage'
import { deleteImagesQuietly, storeRequestImages } from './images'
import { wishlistRpc } from './rpc'
import { createRequestSchema, requestIdSchema, requestRowSchema } from './schema'
import type { RequestRow, VoteResult } from './types'

// Writes for signed-in users. `db` is the service-role client; the caller has already
// checked the session, and every SQL function re-checks the threshold (ARCHITECTURE §15.1).
export type WishlistDeps = { db: SupabaseClient; store: ObjectStore }

export function isWishlistEligible(db: SupabaseClient, userId: string): Promise<boolean> {
  return wishlistRpc(db, 'wishlist_eligible', { p_user_id: userId }, z.boolean())
}

// Pending until the Owner reviews it. One database round trip (AGENTS §5.1):
// create_template_request checks the threshold, ban and per-account limit as it inserts.
// The images are re-encoded first because the row must name them; a refused post deletes
// them again. Ineligible accounts never get here from the UI (the button is disabled).
export async function createRequest(deps: WishlistDeps, userId: string, body: unknown): Promise<RequestRow> {
  const parsed = createRequestSchema.safeParse(body)
  if (!parsed.success) throw new AppError('INVALID_INPUT', 'Add a description (up to 300 characters) and 1 to 3 photos')

  const keys = await storeRequestImages(deps.store, userId, parsed.data.input_keys)
  try {
    const args = { p_user_id: userId, p_description: parsed.data.description, p_image_keys: keys }
    return await wishlistRpc(deps.db, 'create_template_request', args, requestRowSchema)
  } catch (error) {
    await deleteImagesQuietly(deps.store, keys)
    throw error
  }
}

const voteRowsSchema = z.tuple([z.object({ voted: z.boolean(), votes_count: z.number().int() })])

// "I want this too": a second call takes the vote back. Weighted by tier inside SQL.
export async function toggleVote(db: SupabaseClient, userId: string, requestId: unknown): Promise<VoteResult> {
  const id = requestIdSchema.safeParse(requestId)
  if (!id.success) throw new AppError('NOT_FOUND', 'That request no longer exists')
  const [row] = await wishlistRpc(
    db,
    'toggle_template_request_vote',
    { p_request_id: id.data, p_user_id: userId },
    voteRowsSchema,
  )
  return { voted: row.voted, votesCount: row.votes_count }
}

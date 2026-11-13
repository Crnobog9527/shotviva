import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '../errors'
import { logger } from '../logger'
import { deleteImages, signImages } from './images'
import type { WishlistDeps } from './requests'
import { wishlistRpc } from './rpc'
import { reviewInputSchema } from './schema'
import { REQUEST_STATUSES, type AdminRequest, type RequestStatus, type ReviewAction } from './types'

// The review page (ARCHITECTURE §10 page 2). Service-role client only; callers have passed
// requireAdmin().

const adminRowsSchema = z.array(
  z.object({
    id: z.string(),
    email: z.string().nullable(),
    description: z.string(),
    image_keys: z.array(z.string()),
    status: z.enum(REQUEST_STATUSES),
    template_id: z.string().nullable(),
    votes_count: z.number().int(),
    created_at: z.string(),
  }),
)

export async function listAdminRequests(deps: WishlistDeps): Promise<AdminRequest[]> {
  const rows = await wishlistRpc(deps.db, 'admin_list_template_requests', {}, adminRowsSchema)
  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      email: row.email,
      description: row.description,
      status: row.status,
      templateId: row.template_id,
      votesCount: row.votes_count,
      imageUrls: await signImages(deps.store, row.image_keys),
      createdAt: row.created_at,
    })),
  )
}

const TARGET: Record<ReviewAction, RequestStatus> = { approve: 'live', reject: 'rejected', ship: 'shipped' }

// One round trip (AGENTS §5.1): the SQL function checks and applies the move and hands back
// the image keys a rejection dropped; their R2 objects go after it commits. If R2 fails the
// move still stands (the Owner sees it done) and the orphans are logged; they sit under the
// author's requests/ prefix, so account deletion still clears them.
export async function reviewRequest(deps: WishlistDeps, input: unknown): Promise<void> {
  const parsed = reviewInputSchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', 'Invalid review input')
  const review = parsed.data
  const args = {
    p_request_id: review.id,
    p_status: TARGET[review.action],
    p_template_id: review.action === 'ship' ? review.templateId : null,
  }
  const dropped = await wishlistRpc(deps.db, 'admin_review_template_request', args, z.array(z.string()))
  await deleteImages(deps.store, dropped).catch((error: unknown) =>
    logger.error('wishlist.review.images_not_deleted', { requestId: review.id, keys: dropped, error }),
  )
}

// Templates a shipped request can link to: every template, published or not, since the Owner
// may mark it shipped right before publishing. Deleted templates (1401) are left out.
export async function listTemplateOptions(db: SupabaseClient): Promise<{ id: string; name: string }[]> {
  const { data, error } = await db
    .from('templates')
    .select('id, name')
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .returns<{ id: string; name: string }[]>()
  if (error) throw new AppError('INTERNAL', `listTemplateOptions failed: ${error.message}`)
  return data
}

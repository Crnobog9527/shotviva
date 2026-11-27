import 'server-only'

import { z } from 'zod'

import { toRpcError, type RpcClient } from '../billing/rpc'
import { AppError, type ErrorCode } from '../errors'
import {
  createShareSchema,
  isWorkShareId,
  listRowSchema,
  sharedRowSchema,
  toWorkShare,
  type CreateShareInput,
  type OwnShare,
  type WorkShare,
} from './share-schema'

// The message create_work_share's hourly / daily limit carries, so the action can tell it from the
// live-link cap.
export const WORK_SHARE_TOO_OFTEN = 'Too many share links made recently'

// The four functions of migration 1871, all service-role only: the caller passes the user it read
// from the session and the function checks ownership itself (one round trip each, AGENTS §5.1).

// This feature's own exception messages; the rest are the shared ones (billing/rpc.ts).
const SHARE_ERRORS: Record<string, { code: ErrorCode; message: string }> = {
  WORK_SHARE_JOB_NOT_FOUND: { code: 'NOT_FOUND', message: 'A work is not yours, not finished or deleted' },
  WORK_SHARE_NOT_FOUND: { code: 'NOT_FOUND', message: 'No such share link' },
  WORK_SHARE_LIMIT: { code: 'RATE_LIMITED', message: 'Too many live share links' },
  // 20 an hour, 100 a day, turned-off links included (migration 1871).
  WORK_SHARE_RATE_LIMITED: { code: 'RATE_LIMITED', message: WORK_SHARE_TOO_OFTEN },
}

async function rpc(client: RpcClient, fn: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await client.rpc(fn, args)
  if (!error) return data
  const known = SHARE_ERRORS[error.message]
  throw known ? new AppError(known.code, known.message, { cause: error }) : toRpcError(fn, error)
}

export async function createWorkShare(client: RpcClient, userId: string, input: CreateShareInput): Promise<string> {
  const parsed = createShareSchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', 'Bad share request', { cause: parsed.error })
  const { jobIds, showBefore, title, note } = parsed.data
  const id = await rpc(client, 'create_work_share', {
    p_user_id: userId,
    p_job_ids: jobIds,
    p_show_before: showBefore,
    p_title: title || null,
    p_note: note || null,
  })
  if (!isWorkShareId(id)) throw new AppError('INTERNAL', 'create_work_share returned an unexpected id')
  return id
}

export async function revokeWorkShare(client: RpcClient, userId: string, shareId: string): Promise<void> {
  if (!isWorkShareId(shareId)) throw new AppError('NOT_FOUND', 'No such share link')
  await rpc(client, 'revoke_work_share', { p_user_id: userId, p_share_id: shareId })
}

export const OWN_SHARES_PAGE = 30

export async function listWorkShares(client: RpcClient, userId: string, before?: { at: string; id: string }): Promise<OwnShare[]> {
  const data = await rpc(client, 'list_work_shares', {
    p_user_id: userId,
    p_limit: OWN_SHARES_PAGE,
    p_before_at: before?.at ?? null,
    p_before_id: before?.id ?? null,
  })
  return z
    .array(listRowSchema)
    .parse(data)
    .map((row) => ({
      id: row.id,
      title: row.title,
      showBefore: row.show_before,
      createdAt: new Date(row.created_at),
      cursor: row.created_at,
      revokedAt: row.revoked_at === null ? null : new Date(row.revoked_at),
      works: row.works,
      coverJobId: row.cover_job_id,
    }))
}

// The public read: null for a malformed id (no database read), a missing or revoked link, or a
// banned owner's link. Deleted works are already left out.
export async function readWorkShare(client: RpcClient, shareId: string): Promise<WorkShare | null> {
  if (!isWorkShareId(shareId)) return null
  const data = await rpc(client, 'read_work_share', { p_share_id: shareId })
  if (data === null) return null
  return toWorkShare(sharedRowSchema.parse(data))
}

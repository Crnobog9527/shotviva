import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { callRpc } from '@/core/billing'
import { AppError } from '@/core/errors'
import type { ObjectStore } from '@/core/storage'

// Admin "查看作品" (ARCHITECTURE §10, T25). admin_view_work writes the view_work audit row and
// returns the job's keys in the same call, so no view goes unrecorded. The output is the clean
// original (no watermark, whatever the pool). The input is the copy kept with the work (T40,
// outputs/…-in-1) when there is one; works made before T40 only have their inputs/ upload, which
// the bucket lifecycle deletes after 7 days, and those read as expired. Links are signed for 5 minutes and only ever
// point at R2: no image bytes pass through the function (AGENTS §6).

export const VIEW_LINK_SECONDS = 300
export const INPUT_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000

// deleted: the user deleted the work (T41); its files are gone, so nothing is signed.
export type WorkLinks = { output: string | null; input: string | null; inputExpired: boolean; deleted: boolean }

// A set-returning function: PostgREST answers with its one row in an array.
const viewSchema = z
  .array(
    z.object({
      user_id: z.uuid(),
      status: z.enum(['running', 'succeeded', 'failed']),
      output_key: z.string().nullable(),
      input_key: z.string().nullable(),
      created_at: z.string(),
      deleted_at: z.string().nullable(),
    }),
  )
  .length(1)
  .transform((rows) => rows[0]!)

type Deps = { db: SupabaseClient; store: ObjectStore; now?: Date }

const isKeptCopy = (key: string) => key.startsWith('outputs/')

async function inputLink(store: ObjectStore, key: string | null, createdAt: string, now: Date) {
  if (!key) return { input: null, inputExpired: false }
  // The lifecycle rule may run a little late or early; past 7 days an inputs/ upload is gone by
  // policy, and otherwise a HEAD tells a deleted object from a live one.
  const pastLifecycle = !isKeptCopy(key) && now.getTime() - Date.parse(createdAt) >= INPUT_LIFETIME_MS
  if (pastLifecycle || !(await store.head(key))) {
    return { input: null, inputExpired: true }
  }
  return { input: await store.presignGet(key, { expiresInSeconds: VIEW_LINK_SECONDS }), inputExpired: false }
}

export async function viewWork({ db, store, now = new Date() }: Deps, jobId: unknown): Promise<WorkLinks> {
  const id = z.uuid().safeParse(jobId)
  if (!id.success) throw new AppError('INVALID_INPUT', '任务 id 不对。')
  const job = await callRpc(db, 'admin_view_work', { p_job_id: id.data }, viewSchema)
  // The view is still logged by admin_view_work; a deleted work only says so.
  if (job.deleted_at) return { output: null, input: null, inputExpired: false, deleted: true }
  const [output, input] = await Promise.all([
    job.status === 'succeeded' && job.output_key ? store.presignGet(job.output_key, { expiresInSeconds: VIEW_LINK_SECONDS }) : null,
    inputLink(store, job.input_key, job.created_at, now),
  ])
  return { output, ...input, deleted: false }
}

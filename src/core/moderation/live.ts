import 'server-only'

import { revalidateTag } from 'next/cache'
import { after } from 'next/server'

import { createAdminSupabase } from '../auth/supabase-admin'
import { serverEnv } from '../env'
import { GALLERY_CACHE_TAG } from '../gallery/cache'
import { inGalleryScope } from '../gallery/scope'
import { syncGalleryVariants } from '../gallery/variant-sync'
import type { Job } from '../jobs/job-schema'
import { r2Store } from '../storage/r2-store'
import { SCREEN_COLUMNS, screenRowSchema, screenWork, type ModerationDeps } from './moderate-work'
import { screenWithOpenAI } from './openai-screen'

export function moderationKey(): string | null {
  const env = serverEnv()
  return env.OPENAI_MODERATION_API_KEY ?? env.OPENAI_API_KEY ?? null
}

// Production wiring: the service-role client, R2 and the OpenAI key. An auto-approved work is new
// gallery content, so the gallery's pages refresh on their next visit, and its gallery copies are
// made now (this already runs after a response, or in the sweep), so its first view is fast.
export function liveModerationDeps(): ModerationDeps & { db: ReturnType<typeof createAdminSupabase> } {
  const key = moderationKey()
  const db = createAdminSupabase()
  const store = r2Store()
  return {
    db,
    store,
    screen: key ? (input) => screenWithOpenAI(key, input) : null,
    onApproved: async (jobId) => {
      revalidateTag(GALLERY_CACHE_TAG, 'max')
      await syncGalleryVariants({ db, store }, 'approved', [jobId])
    },
  }
}

// Whether a finished work goes to the screen at all (ARCHITECTURE §9 第 7 条).
export function needsScreen(job: Pick<Job, 'status' | 'visibility' | 'source' | 'templateId' | 'deletedAt'>): boolean {
  return job.status === 'succeeded' && job.visibility === 'public' && !job.deletedAt && inGalleryScope(job)
}

async function screenNow(jobId: string): Promise<void> {
  const deps = liveModerationDeps()
  if (!deps.screen) return
  const { data } = await deps.db.from('generation_jobs').select(SCREEN_COLUMNS).eq('id', jobId).maybeSingle()
  const row = screenRowSchema.safeParse(data)
  if (row.success) await screenWork(deps, row.data)
}

// Right after the response that finished the work. Outside a request scope (scripts, tests)
// nothing runs: the sweep picks the work up within ten minutes, so this is only a head start.
export function scheduleScreen(job: Parameters<typeof needsScreen>[0] & { id: string }): void {
  if (!needsScreen(job)) return
  try {
    after(() => screenNow(job.id).catch(() => undefined))
  } catch {
    // No request scope.
  }
}

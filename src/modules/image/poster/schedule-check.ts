import 'server-only'

import { after } from 'next/server'

import { createAdminSupabase } from '@/core/auth/supabase-admin'
import type { Job } from '@/core/jobs'
import { logger } from '@/core/logger'
import { activeCredentials } from '@/core/providers'
import { r2Store } from '@/core/storage'

import { runPosterCheck } from './run-check'

// Runs the text check of a finished poster after the response (ARCHITECTURE §5.3), never on the
// request that made it: the user sees the poster at once, the check result a few seconds later.
export function schedulePosterCheck(job: Pick<Job, 'id'>): void {
  after(async () => {
    try {
      await runPosterCheck({ db: createAdminSupabase(), store: r2Store(), credentials: () => activeCredentials('decision') }, job.id)
    } catch (error) {
      logger.error('poster.check.crashed', { jobId: job.id, error })
    }
  })
}

import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { effectiveTier, limitsFor, readBalance } from '@/core/billing'
import type { Locale } from '@/core/i18n'
import { findOwnJob, listRunningJobIds } from '@/core/jobs'
import type { ObjectStore } from '@/core/storage'
import { listTemplatesIn } from '@/core/templates'

import { toCatalogueTemplate } from '../catalogue/catalogue-template'
import type { AgainContext } from './again-context'
import { loadAgain } from './load-again'

type Deps = { db: SupabaseClient; admin: SupabaseClient; store: () => ObjectStore; locale: Locale }

// Make again inside the Photos viewer (T40 in place of the workspace page): what
// /generate/[templateId]?again= reads, for the work's own template. Like that page, it copies
// the kept photos back to fresh uploads, so it runs only when the user picks Make again. null:
// not the caller's finished work, or its template left the catalogue.
export async function loadAgainContext(deps: Deps, req: { userId: string; jobId: string }): Promise<AgainContext | null> {
  const job = await findOwnJob(deps.admin, req.userId, req.jobId)
  if (!job || job.status !== 'succeeded') return null
  const [found] = await listTemplatesIn(deps.db, deps.locale, { id: job.templateId })
  if (!found) return null
  const template = toCatalogueTemplate(found)
  const [balance, tier, runningIds, again] = await Promise.all([
    readBalance(deps.db, req.userId),
    // effective_tier() (an unbanned admin counts as Max) is service-role only; the user's own id comes from the session.
    effectiveTier(deps.admin, req.userId),
    listRunningJobIds(deps.admin, req.userId, new Date()),
    loadAgain({ db: deps.admin, store: deps.store }, { userId: req.userId, jobId: job.id, template }),
  ])
  return again ? { template, again, balance, tier, concurrency: { limit: limitsFor(tier).concurrency, runningIds } } : null
}

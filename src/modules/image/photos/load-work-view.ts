import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { getTranslations } from 'next-intl/server'

import { currentTier, limitsFor, readBalance } from '@/core/billing'
import { fileUrlFor, findOwnJob, hasInputPreview, jobRefOrShort, keptInputsOf, originalUrlFor, type Job } from '@/core/jobs'
import type { Locale } from '@/core/i18n'
import type { ObjectStore } from '@/core/storage'
import { EDIT_TEMPLATE_ID, listTemplatesIn, loadEditOffer } from '@/core/templates'

import { toPhotoDetail } from '../detail/photo-detail'
import { editDisplay, editOriginal } from './edit-display'
import type { WorkView } from './work-view'

// shareText: the Share sheet's line, from the site config (which modules do not read).
type Deps = { db: SupabaseClient; admin: SupabaseClient; store: () => ObjectStore; locale: Locale; shareText: string }

// One finished work as the Photos viewer shows it (GET /api/photos/[jobId]): what the photo page
// used to read on the server, in one round. The templates (the work's name, and whether Make
// again still has a template to go to), the upload preview's HEAD (T32), for an edit the work it
// came from, the edit offer with balance and tier (T30), and the reference number (T78; a failed
// read falls back to the first 8 characters rather than failing the view). null: not the
// caller's, not finished, or deleted.
export async function loadWorkView(deps: Deps, req: { userId: string; jobId: string }): Promise<WorkView | null> {
  const job = await findOwnJob(deps.admin, req.userId, req.jobId)
  if (!job || job.status !== 'succeeded') return null
  const { templates, kept, parent, offer, balance, tier, reference, t } = await readAround(deps, req.userId, job)
  const lookup = new Map(templates.map((tpl) => [tpl.id, { name: tpl.name, cover: tpl.coverAfterUrl }]))
  const names = { fallback: t('photos.fallbackName'), edited: t('photos.editedName'), titleEdited: (name: string) => t('edit.titleEdited', { name }) }
  const { item, source, change } = editDisplay(job, parent, lookup, names, fileUrlFor)
  const detail = { ...toPhotoDetail(job, kept ? originalUrlFor(job.id) : null, keptInputsOf(job).length > 0), reference }
  if (job.templateId === EDIT_TEMPLATE_ID) detail.original = editOriginal(source)
  return {
    item,
    detail,
    parent: source && { id: source.id, fileUrl: source.fileUrl as string, name: source.templateName },
    // findOwnJob leaves out a deleted work (T41), so a parent id with no parent row means deleted.
    parentDeleted: job.parentJobId !== null && parent === null,
    change,
    // Make again needs the template in today's catalogue; an edit has none (T40).
    againable: job.templateId !== EDIT_TEMPLATE_ID && lookup.has(job.templateId),
    edit: offer && { ...offer, balance, concurrency: limitsFor(tier).concurrency },
    shareText: deps.shareText,
  }
}

// Everything besides the job, in one round.
async function readAround(deps: Deps, userId: string, job: Job) {
  const [templates, kept, parent, offer, balance, tier, reference, t] = await Promise.all([
    listTemplatesIn(deps.db, deps.locale, { includeSeriesMembers: true }),
    // An edit has no upload of its own (T30).
    job.templateId === EDIT_TEMPLATE_ID ? false : hasInputPreview(deps.store(), job),
    job.parentJobId ? findOwnJob(deps.admin, userId, job.parentJobId) : null,
    loadEditOffer(deps.db),
    readBalance(deps.db, userId),
    // current_tier() is service-role only; the user's own id comes from the session.
    currentTier(deps.admin, userId),
    jobRefOrShort(deps.admin, job.id),
    getTranslations({ locale: deps.locale, namespace: 'app' }),
  ])
  return { templates, kept, parent, offer, balance, tier, reference, t }
}

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
import type { TemplateLookup } from './photo-item'
import type { WorkView } from './work-view'

// shareText: the Share sheet's line, from the site config (which modules do not read).
type Deps = { db: SupabaseClient; admin: SupabaseClient; store: () => ObjectStore; locale: Locale; shareText: string }
type Req = { userId: string; jobId: string }

// One finished work as the Photos viewer shows it (GET /api/photos/[jobId]): what the photo page
// used to read on the server. Rounds: the job with everything that does not depend on it (the
// edit offer, balance and tier for Edit, T30; the reference number, T78, which falls back to the
// first 8 characters rather than failing the view); then the upload preview's HEAD (T32), for an
// edit the work it came from, and the job's template; for an edit, its source's template. Only
// those templates are read, by id, not the whole catalogue (on a loaded database that read hit
// the statement timeout). Names and words are in deps.locale, the page's language (an /api
// address has none of its own). null: not the caller's, not finished, or deleted.
export async function loadWorkView(deps: Deps, req: Req): Promise<WorkView | null> {
  const [job, around] = await Promise.all([findOwnJob(deps.admin, req.userId, req.jobId), readAround(deps, req)])
  if (!job || job.status !== 'succeeded') return null
  const { offer, balance, tier, reference, t } = around
  const { kept, parent, lookup } = await readFromJob(deps, req.userId, job)
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

// What the view needs besides the job: the edit offer, balance and tier, the reference number
// and the messages.
async function readAround(deps: Deps, req: Req) {
  const [offer, balance, tier, reference, t] = await Promise.all([
    loadEditOffer(deps.db),
    readBalance(deps.db, req.userId),
    // current_tier() is service-role only; the user's own id comes from the session.
    currentTier(deps.admin, req.userId),
    jobRefOrShort(deps.admin, req.jobId),
    getTranslations({ locale: deps.locale, namespace: 'app' }),
  ])
  return { offer, balance, tier, reference, t }
}

// What depends on the job: the upload preview's HEAD (an edit has no upload of its own, T30),
// the work an edit came from, and the templates that name them.
async function readFromJob(deps: Deps, userId: string, job: Job) {
  const [kept, parent, own] = await Promise.all([
    job.templateId === EDIT_TEMPLATE_ID ? false : hasInputPreview(deps.store(), job),
    job.parentJobId ? findOwnJob(deps.admin, userId, job.parentJobId) : null,
    templateNamed(deps, job.templateId),
  ])
  const theirs = parent && parent.templateId !== job.templateId ? await templateNamed(deps, parent.templateId) : []
  const lookup: TemplateLookup = new Map([...own, ...theirs].map((tpl) => [tpl.id, { name: tpl.name, cover: tpl.coverAfterUrl }]))
  return { kept, parent, lookup }
}

// One template of today's web catalogue by id (series members included), or none: the built-in
// edit template and retired ones are in no catalogue.
const templateNamed = (deps: Deps, id: string) => (id === EDIT_TEMPLATE_ID ? Promise.resolve([]) : listTemplatesIn(deps.db, deps.locale, { id }))

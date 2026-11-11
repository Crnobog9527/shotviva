import 'server-only'

import { z } from 'zod'

import { createAdminSupabase } from '../auth/supabase-admin'
import type { SiteConfig } from '../config'
import { logger } from '../logger'
import { isGalleryEnabled } from './enabled'
import { isWorkId } from './reads'

// 「一键复用」 (ARCHITECTURE §9 第 3 条): the settings of a work the gallery shows, for a workspace
// of the same template. Only what the form can take back: size, resolution, copy fields and
// toggles. Never the photos, the note, an edit instruction, or the original's confirmations
// (the reuser sees a toggle's dialog again). Null for anything the gallery does not show.
export type ReuseInputs = { aspect_ratio?: unknown; resolution?: unknown; copy?: unknown; toggles?: unknown }

export async function galleryReuseInputs(site: SiteConfig, jobId: string, templateId: string): Promise<ReuseInputs | null> {
  if (!isWorkId(jobId) || !(await isGalleryEnabled(site))) return null
  const { data, error } = await createAdminSupabase()
    .from('generation_jobs')
    .select('inputs, parent_job_id')
    .eq('id', jobId)
    .eq('template_id', templateId)
    .eq('status', 'succeeded')
    .eq('visibility', 'public')
    .eq('moderation_status', 'approved')
    .is('deleted_at', null)
    .eq('source', 'web')
    .maybeSingle()
  if (error) {
    logger.warn('gallery.reuse_read_failed', { error: error.message })
    return null
  }
  const row = z.object({ inputs: z.record(z.string(), z.unknown()), parent_job_id: z.string().nullable() }).safeParse(data)
  if (!row.success || row.data.parent_job_id) return null
  const { aspect_ratio, resolution, copy, toggles } = row.data.inputs
  return { aspect_ratio, resolution, copy, toggles }
}

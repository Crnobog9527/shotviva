import 'server-only'

import { createAdminSupabase } from '../auth/supabase-admin'
import type { SiteConfig } from '../config'
import { logger } from '../logger'
import { settingValue } from '../system-settings/registry'
import { siteHasGallery } from './switch'

// /g/<id> answers 404 here, in the proxy, whenever the gallery does not show the work (ARCHITECTURE
// §9, 创作库规格 §3: a real 404, never 200 + noindex). The page renders per request (an unlisted id
// is request data to Next), and a per-request page has already sent 200 by the time it could
// call notFound().
//
// Cost per request: a site without a gallery reads nothing; a closed gallery reads nothing either
// (the switch is held here for SWITCH_TTL_MS, failures included); an open one reads the one work.
// The proxy holds the switch itself: it runs apart from the render cache, so the settings cache
// tag never reaches it, and a switch change takes effect here within SWITCH_TTL_MS. Random ids
// against an open gallery still cost one read each: a Vercel Firewall rate limit on /g/* and
// /api/gallery/* is required before the gallery is switched on.

export const SWITCH_TTL_MS = 10_000

const WORK_PATH = /^(?:\/zh)?\/g\/([^/]+)\/?$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The work id of a /g address (either language): '' for a malformed one, null for other paths.
export function galleryWorkIdOf(pathname: string): string | null {
  const match = WORK_PATH.exec(pathname)
  if (!match) return null
  return UUID.test(match[1] ?? '') ? (match[1] ?? '') : ''
}

export type GateReads = {
  // The stored switch; throws when it cannot be read.
  readOpen: () => Promise<boolean>
  // Whether the gallery shows this work (approved, public, live, in scope, template on sale); throws on failure.
  readShown: (id: string) => Promise<boolean>
  now: () => number
}

export function createGalleryGate(site: SiteConfig, reads: GateReads) {
  let held: { open: boolean; at: number } | null = null
  async function isOpen(): Promise<boolean> {
    const now = reads.now()
    if (held && now - held.at < SWITCH_TTL_MS) return held.open
    let open = false
    try {
      open = await reads.readOpen()
    } catch (error) {
      logger.warn('gallery.proxy_switch_read_failed', { error })
    }
    held = { open, at: now }
    return open
  }
  return async function isShownWork(id: string): Promise<boolean> {
    if (!siteHasGallery(site) || !(await isOpen())) return false
    try {
      return await reads.readShown(id)
    } catch (error) {
      logger.warn('gallery.proxy_work_read_failed', { error })
      return false
    }
  }
}

async function readOpen(): Promise<boolean> {
  const { data, error } = await createAdminSupabase().from('system_settings').select('value').eq('key', 'gallery_enabled').maybeSingle()
  if (error) throw new Error(error.message)
  return settingValue({ gallery_enabled: (data as { value?: unknown } | null)?.value }, 'gallery_enabled')
}

async function readShown(id: string): Promise<boolean> {
  // The template must be on sale on the web too, as the page requires (core/templates/list-templates):
  // a work whose template was taken off sale would otherwise pass here and 404 in the page with 200.
  const { data, error } = await createAdminSupabase()
    .from('generation_jobs')
    .select('id, templates!inner(id)')
    .eq('templates.is_active', true)
    .contains('templates.visible_in', ['web'])
    .eq('id', id)
    .eq('status', 'succeeded')
    .eq('visibility', 'public')
    .eq('moderation_status', 'approved')
    .is('deleted_at', null)
    .eq('source', 'web')
    .neq('template_id', 'freeform')
    .neq('template_id', 'edit')
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data !== null
}

export function liveGalleryGate(site: SiteConfig) {
  return createGalleryGate(site, { readOpen, readShown, now: Date.now })
}

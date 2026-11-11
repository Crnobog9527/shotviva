import 'server-only'

import { createAdminSupabase } from '../auth/supabase-admin'
import { logger } from '../logger'
import { settingValue } from '../system-settings/registry'

// /g/<id> answers 404 here, in the proxy, whenever the gallery does not show the work (ARCHITECTURE
// §9, 创作库规格 §3: a real 404, never 200 + noindex). The page itself renders per request (a work
// id cannot be prerendered: ids are unbounded and Next treats an unlisted one as request data),
// and a per-request page has already sent 200 by the time it could call notFound().

const WORK_PATH = /^(?:\/zh)?\/g\/([^/]+)\/?$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The work id of a /g address (either language): '' for a malformed one, null for other paths.
export function galleryWorkIdOf(pathname: string): string | null {
  const match = WORK_PATH.exec(pathname)
  if (!match) return null
  return UUID.test(match[1] ?? '') ? (match[1] ?? '') : ''
}

// The gallery is open and shows this work. Two small reads in parallel, on the gallery index and
// the settings key; any failure closes it.
export async function isShownWork(id: string): Promise<boolean> {
  try {
    const db = createAdminSupabase()
    const [setting, work] = await Promise.all([
      db.from('system_settings').select('value').eq('key', 'gallery_enabled').maybeSingle(),
      db
        .from('generation_jobs')
        .select('id')
        .eq('id', id)
        .eq('status', 'succeeded')
        .eq('visibility', 'public')
        .eq('moderation_status', 'approved')
        .is('deleted_at', null)
        .eq('source', 'web')
        .neq('template_id', 'freeform')
        .neq('template_id', 'edit')
        .maybeSingle(),
    ])
    if (setting.error || work.error) throw new Error(setting.error?.message ?? work.error?.message)
    const open = settingValue({ gallery_enabled: (setting.data as { value?: unknown } | null)?.value }, 'gallery_enabled')
    return open && work.data !== null
  } catch (error) {
    logger.warn('gallery.proxy_gate_failed', { error })
    return false
  }
}

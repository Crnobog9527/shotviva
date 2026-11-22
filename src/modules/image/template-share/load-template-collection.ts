import 'server-only'

import { createAdminSupabase } from '@/core/auth'
import type { Locale } from '@/core/i18n/locales'
import { readTemplateShare } from '@/core/template-shares'

import { loadCatalogueView } from '../catalogue/load-catalogue-view'
import { resolveCollection, type CollectionEntry } from './resolve-collection'

export type TemplateCollection = { id: string; title: string | null; note: string | null; entries: CollectionEntry[] }

// A share link's collection for /s/t/<id>, read on the server (anyone with the link may see it;
// the row is read by its primary key with the service role, never from the browser). null for
// an unknown or revoked link, or one whose every pick has gone offline.
export async function loadTemplateCollection(locale: Locale, id: string): Promise<TemplateCollection | null> {
  const share = await readTemplateShare(createAdminSupabase(), id)
  if (!share || share.revokedAt) return null
  const view = await loadCatalogueView(locale)
  const entries = resolveCollection(view.entries, share.items)
  return entries.length ? { id: share.id, title: share.title, note: share.note, entries } : null
}

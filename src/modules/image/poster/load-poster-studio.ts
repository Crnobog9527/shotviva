import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Locale } from '@/core/i18n/locales'
import { featureAllowed } from '@/core/features'
import { POSTER_FEATURE } from '@/core/poster/sets'
import { listTemplatesIn, type LocalizedTemplate } from '@/core/templates'
import { FULL_IMAGE_OPTIONS } from '@/core/templates/image-options'
import type { OutputAspect } from '@/core/templates/output-options'

import type { StudioTemplate } from './use-poster-studio'

// Server side of the poster pages (ARCHITECTURE §5.3): invite-only, so a caller who may not use
// the feature gets null and the page answers 404, as if it did not exist.

export const posterAllowed = (userId: string) => featureAllowed(userId, POSTER_FEATURE).catch(() => false)

export async function listPosterTemplates(db: SupabaseClient, locale: Locale): Promise<{ id: string; name: string; description: string | null }[]> {
  const templates = await listTemplatesIn(db, locale, { posters: true })
  return templates.map((template) => ({ id: template.id, name: template.name, description: template.description }))
}

export function toStudioTemplate(template: LocalizedTemplate): StudioTemplate | null {
  const poster = template.fields.poster
  if (!poster) return null
  const options = template.imageOptions ?? FULL_IMAGE_OPTIONS
  // Only the sizes the template lists (tall posters first), and only those its model can make.
  const aspects = template.fields.aspectRatios.filter((ratio): ratio is OutputAspect => (options.aspectRatios as string[]).includes(ratio))
  return { id: template.id, name: template.name, poster, aspects, resolutions: options.resolutions, creditsCost: template.creditsCost }
}

export async function loadStudioTemplate(db: SupabaseClient, locale: Locale, id: string): Promise<StudioTemplate | null> {
  const [found] = await listTemplatesIn(db, locale, { id })
  return found ? toStudioTemplate(found) : null
}

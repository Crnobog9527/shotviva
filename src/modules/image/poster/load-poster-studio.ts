import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Locale } from '@/core/i18n/locales'
import { featureAllowed } from '@/core/features'
import { templateAspectFilter } from '@/core/providers'
import { POSTER_FEATURE } from '@/core/poster/sets'
import { listTemplatesIn, type LocalizedTemplate } from '@/core/templates'
import { FULL_IMAGE_OPTIONS } from '@/core/templates/image-options'
import type { OutputAspect } from '@/core/templates/output-options'

import type { StudioTemplate } from './use-poster-studio'

// Server side of the poster pages (ARCHITECTURE §5.3): a caller the dense_poster feature does not
// allow (open to everyone today; the admin can gate it again) gets null and the page answers 404.

export const posterAllowed = (userId: string) => featureAllowed(userId, POSTER_FEATURE).catch(() => false)

export function toStudioTemplate(template: LocalizedTemplate): StudioTemplate | null {
  const poster = template.fields.poster
  if (!poster) return null
  const options = template.imageOptions ?? FULL_IMAGE_OPTIONS
  // Only the sizes the template lists (tall posters first), and only those its model can make.
  const aspects = template.fields.aspectRatios.filter((ratio): ratio is OutputAspect => (options.aspectRatios as string[]).includes(ratio))
  // Every tier the template's model makes, 1K included; the editor starts on 2K (defaultResolution).
  const slots = (template.fields.images.slots ?? []).map(({ key, label, help, required }) => ({ key, label, required, ...(help ? { help } : {}) }))
  return { id: template.id, name: template.name, poster, aspects, resolutions: options.resolutions, creditsCost: template.creditsCost, slots }
}

// Only the sizes /api/generate will take for this template's model: the offered list comes from
// the template and the adapter, but a bound model's saved capabilities may be narrower.
export function narrowToRoute(template: StudioTemplate, accepts: (aspect: string) => boolean): StudioTemplate {
  return { ...template, aspects: template.aspects.filter(accepts) }
}

// `db`: the admin client (the template's model is private).
export async function loadStudioTemplate(db: SupabaseClient, locale: Locale, id: string): Promise<StudioTemplate | null> {
  const [found] = await listTemplatesIn(db, locale, { id })
  const template = found ? toStudioTemplate(found) : null
  return template ? narrowToRoute(template, await templateAspectFilter(db, id)) : null
}

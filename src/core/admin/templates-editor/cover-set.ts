import type { CoverMediaType } from '@/core/templates/schema'

import type { AdminTemplate } from '../templates/types'

// What one cover tab holds (T87): the common cover's columns, or a language's own cover from
// templates.cover_locales. Empty fields are what that tab has not set; the site falls back.
export type CoverSet = { before: string | null; after: string | null; mediaType: CoverMediaType; video: string | null; poster: string | null }

export function coverSetOf(template: AdminTemplate, code: string | null): CoverSet {
  if (code === null) {
    return {
      before: template.coverBeforeUrl,
      after: template.coverAfterUrl,
      mediaType: template.coverMediaType,
      video: template.coverVideoUrl,
      poster: template.coverPosterUrl,
    }
  }
  const own = template.coverLocales[code] ?? {}
  return { before: own.before ?? null, after: own.after ?? null, mediaType: own.media ?? 'image', video: own.video ?? null, poster: own.poster ?? null }
}

export const hasCover = (set: CoverSet) => Boolean(set.before || set.after || set.video)

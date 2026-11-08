import { z } from 'zod'

import { LOCALES } from '../i18n/locales'
import type { CoverMediaType } from './schema'

// Per-language template covers (ARCHITECTURE §8.3 「封面按语言适配」, T87). templates.cover_locales
// holds each language's own cover; the existing columns are the common cover, which belongs to no
// language. Client-safe: the admin editor and the public pages share these rules.

export const LOCALE_COVER_KEYS = ['before', 'after', 'video', 'poster', 'media'] as const

const url = z.string().min(1)
export const localeCoverSchema = z.object({
  before: url.optional(),
  after: url.optional(),
  video: url.optional(),
  poster: url.optional(),
  media: z.enum(['animated', 'video']).optional(),
})
export type LocaleCover = z.infer<typeof localeCoverSchema>

// A row that fails to parse (hand-edited) shows no language covers rather than breaking a page.
export const coverLocalesSchema = z.record(z.string(), localeCoverSchema).catch({})
export type CoverLocales = Record<string, LocaleCover>

// What a card or an API shows: still before / after, and the motion file with its first frame.
export type ResolvedCover = {
  before: string | null
  after: string | null
  mediaType: CoverMediaType
  video: string | null
  poster: string | null
}

export type CoverSource = {
  coverBeforeUrl: string | null
  coverAfterUrl: string | null
  coverMediaType: CoverMediaType
  coverVideoUrl: string | null
  coverPosterUrl: string | null
  coverLocales: CoverLocales
}

type Motion = Pick<ResolvedCover, 'mediaType' | 'video' | 'poster'>

const commonMotion = (t: CoverSource): Motion | null =>
  t.coverMediaType !== 'image' && t.coverVideoUrl ? { mediaType: t.coverMediaType, video: t.coverVideoUrl, poster: t.coverPosterUrl } : null

const ownMotion = (cover: LocaleCover | undefined): Motion | null =>
  cover?.media && cover.video ? { mediaType: cover.media, video: cover.video, poster: cover.poster ?? null } : null

// The cover a page in `locale` shows (Owner 2026-11-08: nothing is tied to a language). Each part
// (before, after, motion) on its own: the page language's own if set; else the common cover's;
// else, when there is no common one, the first launched language (in LOCALES order, the admin tab
// order) that has it. So one uploaded cover shows everywhere, a language gets its own only when
// one is uploaded for it, and a shared "before" stays shared. Languages not launched yet are
// never read here, whatever cover_locales holds for them.
export function coverForLocale(t: CoverSource, locale: string): ResolvedCover {
  const order = [locale, ...LOCALES.filter((other) => other !== locale)]
  const own = t.coverLocales[locale]
  const pick = (key: 'before' | 'after', common: string | null) =>
    own?.[key] ?? common ?? order.map((code) => t.coverLocales[code]?.[key]).find(Boolean) ?? null
  const motion =
    ownMotion(own) ?? commonMotion(t) ?? order.map((code) => ownMotion(t.coverLocales[code])).find((found) => found !== null) ?? null
  return {
    before: pick('before', t.coverBeforeUrl),
    after: pick('after', t.coverAfterUrl),
    mediaType: motion?.mediaType ?? 'image',
    video: motion?.video ?? null,
    poster: motion?.poster ?? null,
  }
}

// The template as seen in `locale`: its cover columns replaced by what that page shows, so every
// reader of the cover fields (cards, dialog, home, landing, favorites, photos) follows the rule.
export function withLocaleCover<T extends CoverSource>(t: T, locale: string): T {
  const cover = coverForLocale(t, locale)
  return {
    ...t,
    coverBeforeUrl: cover.before,
    coverAfterUrl: cover.after,
    coverMediaType: cover.mediaType,
    coverVideoUrl: cover.video,
    coverPosterUrl: cover.poster,
  }
}

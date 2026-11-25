import { LOCALES, type Locale } from '../i18n/locales'

// 首页首屏大图 (migration 2007): the pair beside the home H1, per language, as an admin picks it.
// One scene shows alone; two to six take turns. A language with no scenes of its own follows the
// default ones; with neither, the page keeps its built-in hero.
export const HERO_SCENES_MAX = 6
export const HERO_CAPTION_MAX = 60

// 'default' or one of the site's languages. The list is the code's (core/i18n/locales.ts), so a
// language added there gets its own hero setting with no change here or in the database.
export const DEFAULT_HERO_SCOPE = 'default'
export type HeroScope = typeof DEFAULT_HERO_SCOPE | Locale
export const HERO_SCOPES: readonly HeroScope[] = [DEFAULT_HERO_SCOPE, ...LOCALES]
export const isHeroScope = (value: unknown): value is HeroScope => typeof value === 'string' && (HERO_SCOPES as readonly string[]).includes(value)

// caption null: the template's name in the page's language.
export type HeroSceneEntry = { templateId: string; caption: string | null }
export type HomeHeroSettings = Partial<Record<HeroScope, HeroSceneEntry[]>>

export type HeroSceneRow = { scope: string; position: number; template_id: string; caption: string | null }

// Rows of a scope the code no longer has (a language taken off the site) are left out.
export function toHomeHeroSettings(rows: readonly HeroSceneRow[]): HomeHeroSettings {
  const settings: HomeHeroSettings = {}
  for (const row of [...rows].sort((a, b) => a.position - b.position)) {
    if (isHeroScope(row.scope)) (settings[row.scope] ??= []).push({ templateId: row.template_id, caption: row.caption })
  }
  return settings
}

// The scenes a language shows: its own when it has any, else the default ones.
export function heroScenesFor(settings: HomeHeroSettings, locale: Locale): HeroSceneEntry[] {
  const own = settings[locale] ?? []
  return own.length > 0 ? own : (settings[DEFAULT_HERO_SCOPE] ?? [])
}

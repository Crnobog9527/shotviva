import 'server-only'

import { getTranslations } from 'next-intl/server'

import type { LiveHeroPair } from '@/core/content'
import type { Locale } from '@/core/i18n'
import { cachedHomeHero } from '@/core/templates/cached-home-hero'
import type { HeroSceneEntry } from '@/core/templates/home-hero'

import { liveHero, optionPictures } from './home-hero-live'

type Live = { id: string; name: string; description: string | null; coverBeforeUrl: string | null; coverAfterUrl: string | null }
type Words = { phone: (name: string) => string; ai: (name: string, use: string) => string }

// The admin's scenes as hero pairs: the template's own covers (liveHero), its name in the page's
// language as the alt text, the admin's caption or else that name. A template that is not live
// drops out (liveHero also drops one without both covers).
export function adminHeroPairs(entries: readonly HeroSceneEntry[], live: readonly Live[], words: Words): LiveHeroPair[] {
  const byId = new Map(live.map((template) => [template.id, template]))
  return entries.flatMap((entry) => {
    const template = byId.get(entry.templateId)
    if (!template) return []
    return [{ templateId: template.id, phone: words.phone(template.name), ai: words.ai(template.name, template.description ?? ''), caption: entry.caption ?? template.name }]
  })
}

type Option = Parameters<typeof optionPictures>[0]

// 首页首屏大图 (Owner 2026-11-25, migration 2007): on `/` the admin's scenes for this language (its
// own, else the default ones) when any of them is live; otherwise, and on every A/B option page
// (/x/hero/…, which shows its own pictures), the option's pictures as before. The words come from
// the language's messages, so a new site language needs nothing here.
export async function homeHeroPictures(option: Option, abOption: boolean, locale: Locale, live: readonly Live[]) {
  if (!abOption) {
    const entries = await cachedHomeHero(locale)
    if (entries.length > 0) {
      const t = await getTranslations({ locale, namespace: 'marketing.home' })
      const words: Words = {
        phone: (name) => t('beforeAlt', { name }),
        // An empty one-liner would leave a dangling comma.
        ai: (name, use) => t('afterAlt', { name, use }).replace(/[,，、]\s*$/, ''),
      }
      const hero = await liveHero(adminHeroPairs(entries, live, words), t('heroScenesLabel'), live)
      if (hero) return hero
    }
  }
  return optionPictures(option, live)
}

import { LOCALES } from '@/core/i18n/locales'
import { effectiveStillCover } from '@/core/templates/client'
import { DEFAULT_HERO_SCOPE, type HeroScope } from '@/core/templates/home-hero'

import type { AdminTemplate } from '../templates/types'

type Covers = Pick<AdminTemplate, 'coverLocales' | 'coverBeforeUrl' | 'coverAfterUrl'>

// Whether the home hero can show this template where the scope applies: both its phone photo and
// its result, as each language's pages resolve covers (per-language first, then the common one).
// A default setting applies to every language, so it needs both in all of them. One without is
// left out of the picker and flagged on an existing row, since the page would skip it.
export function heroCoversReady(template: Covers, scope: HeroScope): boolean {
  const locales = scope === DEFAULT_HERO_SCOPE ? LOCALES : [scope]
  return locales.every((locale) =>
    Boolean(effectiveStillCover(template.coverLocales, locale, 'before', template.coverBeforeUrl)
      && effectiveStillCover(template.coverLocales, locale, 'after', template.coverAfterUrl)))
}

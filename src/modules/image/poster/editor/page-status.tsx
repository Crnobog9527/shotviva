'use client'

import { useLocale, useTranslations } from 'next-intl'

import { sectionChars, type PageLimit, type PosterPart } from '@/core/poster'
import { cn } from '@/core/ui/cn'

import type { StudioTemplate } from '../use-poster-studio'

type Props = { parts: readonly PosterPart[]; template: StudioTemplate }

// Each page of the set and whether it can be made (ARCHITECTURE §5.3: always the template's
// pages): ready, still empty, or over what one page holds, with how much to cut.
export function PageStatus({ parts, template }: Props) {
  const t = useTranslations('app.poster.split')
  const locale = useLocale()
  return (
    <ul className="grid gap-1.5 text-caption">
      {parts.map((part) => {
        const kind = template.poster.kinds.find((item) => item.key === part.kind)
        const name = kind ? (locale === 'zh' ? kind.name.zh : kind.name.en) : part.kind
        const problems = part.empty ? [t('empty')] : (part.over ?? []).map((limit) => t(`over.${limit}`, overCount(part, limit, kind?.capacity[limit] ?? 0)))
        return (
          <li key={part.kind} className="grid gap-0.5">
            <span className="font-medium">{t('part', { page: part.page, name })}{problems.length ? null : <span className="text-muted-foreground"> · {t('ready')}</span>}</span>
            {problems.map((problem) => <span key={problem} className={cn('text-destructive')}>{problem}</span>)}
          </li>
        )
      })}
    </ul>
  )
}

function overCount(part: PosterPart, limit: PageLimit, max: number) {
  const count = limit === 'prizeRows' ? part.prizes?.rows.length ?? 0 : limit === 'tableRows' ? part.table?.rows.length ?? 0 : sectionChars(part.sections ?? [])
  return { max, count }
}

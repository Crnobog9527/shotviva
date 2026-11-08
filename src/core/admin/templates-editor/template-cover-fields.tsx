'use client'

import { useState } from 'react'

import { Badge } from '@/core/ui/badge'
import { cn } from '@/core/ui/cn'

import type { AdminTemplate, CoverLanguage, TemplateAdminActions } from '../templates/types'

import { coverCopy as COPY } from './copy'
import { CoverTab } from './cover-tab'
import { coverSetOf, hasCover } from './cover-set'

type Props = {
  // The latest saved row, so a finished upload shows its new file straight away.
  template: AdminTemplate
  // 通用, each site language, then upcoming ones (ARCHITECTURE §8.3, T87).
  languages: readonly CoverLanguage[]
  actions: Pick<TemplateAdminActions, 'requestCoverUpload' | 'applyCover'>
}

// Cover media (ARCHITECTURE §8.3): per tab, before / after stills for static cards and the preview
// drawer, plus an optional motion cover. The 通用 tab is the cover every language shows unless it
// has its own; a language tab may stay empty. A dot marks tabs that hold a cover.
export function TemplateCoverFields({ template, languages, actions }: Props) {
  const [active, setActive] = useState(0)
  const language = languages[active] ?? languages[0]!
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 text-sm font-semibold">{COPY.legend}</legend>
      <div role="tablist" aria-label={COPY.tabs} className="flex flex-wrap gap-1 border-b">
        {languages.map((tab, index) => (
          <button
            key={tab.code ?? 'common'}
            type="button"
            role="tab"
            aria-selected={index === active}
            onClick={() => setActive(index)}
            className={cn(
              '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm',
              index === active ? 'border-primary text-foreground font-medium' : 'text-muted-foreground border-transparent',
            )}
          >
            {tab.label}
            {tab.upcoming ? <Badge variant="outline">{COPY.upcoming}</Badge> : null}
            {hasCover(coverSetOf(template, tab.code)) ? <span className="bg-primary size-1.5 rounded-full" aria-label={COPY.hasCover} /> : null}
          </button>
        ))}
      </div>
      <CoverTab key={language.code ?? 'common'} template={template} language={language} languages={languages} actions={actions} />
    </fieldset>
  )
}

'use client'

import { useTranslations } from 'next-intl'

import { SECTION_STYLES } from '@/core/poster'
import { Button } from '@/core/ui/button'

import { addSection, linesOf, removeSection, setSection } from '../content-edit'
import type { BlockProps } from './block-props'
import { PosterField } from './poster-field'

// Rule sections: a title, how its lines are numbered, and the lines, one per row of text.
export function SectionsEditor({ content, onChange, flagged }: BlockProps) {
  const t = useTranslations('app.poster')
  return (
    <div className="grid gap-4">
      {content.sections.map((section, i) => {
        const linesFlagged = section.lines.some((_, n) => flagged(`sections.${i}.lines.${n}`))
        return (
          <section key={i} className="grid gap-2 rounded-control bg-card p-3 hairline">
            <div className="grid grid-cols-[1fr_auto] items-end gap-2">
              <PosterField label={t('sections.title')} value={section.title} flagged={flagged(`sections.${i}.title`)} flagNote={t('flagged')}
                onChange={(value) => onChange(setSection(content, i, { title: value }), `sections.${i}.title`)} />
              <Button variant="ghost" size="sm" className="min-h-11" onClick={() => onChange(removeSection(content, i), `sections.${i}`)}>{t('remove')}</Button>
            </div>
            <div role="radiogroup" aria-label={t('sections.style')} className="flex flex-wrap gap-2">
              {SECTION_STYLES.map((style) => (
                <label key={style} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-button px-3 text-caption hairline has-checked:chosen">
                  <input type="radio" name={`style-${i}`} checked={section.style === style} className="sr-only"
                    onChange={() => onChange(setSection(content, i, { style }), `sections.${i}.style`)} />
                  {t(`sections.styles.${style}`)}
                </label>
              ))}
            </div>
            <PosterField label={t('sections.lines')} multiline value={section.lines.join('\n')} flagged={linesFlagged} flagNote={t('flagged')}
              onChange={(value) => onChange(setSection(content, i, { lines: linesOf(value) }), `sections.${i}.lines.0`)} />
          </section>
        )
      })}
      <Button variant="outline" className="min-h-11" onClick={() => onChange(addSection(content), 'sections')}>{t('sections.add')}</Button>
    </div>
  )
}

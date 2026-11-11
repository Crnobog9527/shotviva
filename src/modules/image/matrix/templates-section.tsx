'use client'

/* eslint-disable @next/next/no-img-element -- template covers from the catalogue */
import { useTranslations } from 'next-intl'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { MATRIX_MAX_TEMPLATES } from './matrix-state'

type Props = { chosen: readonly CatalogueTemplate[]; failedId: string | null; onAdd(): void; onRemove(id: string): void }

// The batch's templates (T107): one row each with its cover, name and per-photo credits at the
// chosen resolution, a remove control, then Add template while fewer than five are in. A template
// the preflight found unavailable is marked so the user can take it out.
export function TemplatesSection({ chosen, failedId, onAdd, onRemove }: Props) {
  const t = useTranslations('app.matrix')
  return (
    <div className="grid gap-2">
      {chosen.length > 0 ? (
        <ul className="hairline-lit rounded-panel bg-card px-3 py-1 [&>li+li]:border-t [&>li+li]:border-hairline">
          {chosen.map((template) => {
            const cover = template.cover.after ?? template.cover.poster
            return (
              <li key={template.id} className="flex min-h-16 items-center gap-3 py-2.5">
                <span className="relative size-11 flex-none overflow-hidden rounded-[10px] bg-muted">
                  {cover ? <img src={cover} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-body leading-[1.25] font-semibold">{template.name}</b>
                  <span className={failedId === template.id ? 'mt-0.5 block text-caption text-destructive' : 'mt-0.5 block truncate text-caption text-muted-foreground'}>
                    {failedId === template.id ? t('templateUnavailable') : template.categoryName}
                  </span>
                </span>
                <button type="button" onClick={() => onRemove(template.id)} aria-label={t('removeTemplate', { name: template.name })} className="press -mr-2 grid size-11 flex-none place-items-center rounded-full text-muted-foreground hover:text-foreground">
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                    <path d="M7 7l10 10M17 7 7 17" />
                  </svg>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
      {chosen.length < MATRIX_MAX_TEMPLATES ? (
        <button type="button" onClick={onAdd} className="press flex min-h-14 w-full items-center justify-center gap-2 rounded-tile bg-wash-faint text-label font-semibold text-foreground shadow-[inset_0_0_0_1px_var(--input)]">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px] text-primary" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {t(chosen.length ? 'addTemplate' : 'chooseTemplates')}
          <span className="font-mono text-caption font-normal text-muted-foreground">{t('templatesLeft', { count: MATRIX_MAX_TEMPLATES - chosen.length })}</span>
        </button>
      ) : null}
    </div>
  )
}

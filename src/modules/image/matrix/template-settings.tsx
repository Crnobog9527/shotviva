'use client'

/* eslint-disable @next/next/no-img-element -- local photo previews */
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { REPLAY_BLOCK_CLASS } from '@/core/analytics/browser'
import { cn } from '@/core/ui/cn'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { TemplateToggles } from '../toggles'
import type { BatchPhoto } from '../workspace/photo-batch'
import { CopyFields } from '../workspace/text-fields'
import { cellKey, type MatrixValues } from './matrix-state'

type Props = { template: CatalogueTemplate; photos: readonly BatchPhoto[]; values: MatrixValues; onChange(next: (current: MatrixValues) => MatrixValues): void }

// One template's own settings in the batch (T107): its text, filled once and shared by all its
// photos, its on/off options, and under "Different text for one photo" a photo pick whose text
// starts from the shared text and replaces it for that photo only.
export function TemplateSettings({ template, photos, values, onChange }: Props) {
  const t = useTranslations('app.matrix')
  const shared = values.copy[template.id] ?? {}
  const setShared = (copy: Record<string, string>) => onChange((current) => ({ ...current, copy: { ...current.copy, [template.id]: copy } }))
  const setToggles = (toggles: Record<string, boolean>) => onChange((current) => ({ ...current, toggles: { ...current.toggles, [template.id]: toggles } }))
  if (template.copyFields.length === 0 && template.toggles.length === 0) return null
  return (
    <section aria-labelledby={`set-${template.id}`} className="hairline-lit rounded-panel bg-card p-3.5">
      <h3 id={`set-${template.id}`} className="text-body leading-[1.25] font-semibold">{template.name}</h3>
      {template.copyFields.length > 0 ? (
        <>
          <p className="mt-1 mb-3 text-caption text-muted-foreground">{t('sharedText', { count: photos.length })}</p>
          <CopyFields fields={template.copyFields} values={shared} onChange={setShared} idPrefix={`copy-${template.id}`} />
          {photos.length > 1 ? <PhotoOverride template={template} photos={photos} values={values} onChange={onChange} /> : null}
        </>
      ) : null}
      <TemplateToggles className="pt-4" template={template} values={values.toggles[template.id] ?? {}} onChange={setToggles} surface="workspace" compact />
    </section>
  )
}

function PhotoOverride({ template, photos, values, onChange }: Props) {
  const t = useTranslations('app.matrix')
  const [photoId, setPhotoId] = useState<string | null>(null)
  const key = photoId ? cellKey(template.id, photoId) : null
  const own = key ? values.overrides[key] : undefined
  const text = { ...(values.copy[template.id] ?? {}), ...(own ?? {}) }
  const setOwn = (copy: Record<string, string> | null) => {
    if (!key) return
    onChange((current) => {
      const overrides = { ...current.overrides }
      if (copy) overrides[key] = copy
      else delete overrides[key]
      return { ...current, overrides }
    })
  }
  return (
    <details className="group mt-4 border-t border-hairline pt-3">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-caption font-medium text-foreground">
        {t('overrideTitle')}
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 text-primary transition-transform group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </summary>
      <ul aria-label={t('overridePick')} className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
        {photos.map((photo, index) => {
          const has = Boolean(values.overrides[cellKey(template.id, photo.id)])
          return (
            <li key={photo.id} className="flex-none">
              <button type="button" aria-pressed={photoId === photo.id} onClick={() => setPhotoId(photo.id)} aria-label={t(has ? 'photoNChanged' : 'photoN', { index: index + 1 })} className="press relative block size-12 overflow-hidden rounded-[8px] bg-muted">
                <img src={photo.url} alt="" className={cn(REPLAY_BLOCK_CLASS, 'size-full object-cover')} />
                <span aria-hidden="true" className={cn('pointer-events-none absolute inset-0 rounded-[8px]', photoId === photo.id ? 'shadow-[inset_0_0_0_2px_var(--primary)]' : 'shadow-[inset_0_0_0_1px_var(--border)]')} />
                {has ? <span aria-hidden="true" className="absolute top-1 right-1 size-2 rounded-full bg-primary" /> : null}
              </button>
            </li>
          )
        })}
      </ul>
      {photoId ? (
        <div className="mt-3">
          <CopyFields fields={template.copyFields} values={text} onChange={setOwn} idPrefix={`copy-${template.id}-${photoId}`} />
          {own ? (
            <button type="button" onClick={() => setOwn(null)} className="press mt-2 inline-flex min-h-11 items-center text-caption font-medium text-foreground hover:underline hover:underline-offset-3">
              {t('overrideReset')}
            </button>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-caption text-muted-foreground">{t('overrideHint')}</p>
      )}
    </details>
  )
}

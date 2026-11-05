'use client'

import type { ReactNode } from 'react'

import { balanceSentence } from '@/core/app-shell/balance-copy'
import type { Balance } from '@/core/billing/pools'
import type { OutputAspect, Resolution } from '@/core/templates'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { ResolutionPicker, SizePicker } from './option-pickers'
import { PhotoCard } from './photo-card'
import { PhotoPickers } from './photo-pickers'
import { CopyFields, NoteField } from './text-fields'
import type { usePhoto } from './use-photo'
import { notePlaceholder, SIZE_OPTIONS } from './workspace-options'

export type FormValues = { aspect: OutputAspect; resolution: Resolution; note: string; copy: Record<string, string> }

type Props = {
  template: CatalogueTemplate
  balance: Balance
  photo: ReturnType<typeof usePhoto>
  values: FormValues
  onChange(next: Partial<FormValues>): void
  formats: string
}

// One column, one scroll, no wizard (DESIGN §4.3): photo → text the template needs → the
// optional note → size → resolution, then the balance line above the fixed action bar.
export function WorkspaceForm({ template, balance, photo, values, onChange, formats }: Props) {
  const size = SIZE_OPTIONS.find((option) => option.id === values.aspect)
  return (
    <>
      <Section
        id="photo-h"
        title="Your photo"
        aside={
          photo.photo?.ratio ? (
            <span className="text-caption text-muted-foreground">
              <span className="font-mono">{photo.photo.ratio}</span> · as shot
            </span>
          ) : null
        }
      >
        {photo.photo ? (
          <PhotoCard photo={photo.photo} upload={photo.upload} onPick={photo.pick} />
        ) : (
          <PhotoPickers onPick={photo.pick} formats={formats} />
        )}
      </Section>
      {template.copyFields.length > 0 ? (
        <div className="px-4 pt-6">
          <CopyFields fields={template.copyFields} values={values.copy} onChange={(copy) => onChange({ copy })} />
        </div>
      ) : null}
      <div className="px-4 pt-6">
        <NoteField value={values.note} placeholder={notePlaceholder(template.category)} onChange={(note) => onChange({ note })} />
      </div>
      <Section
        id="size-h"
        title="Size"
        aside={
          <span className="text-caption text-muted-foreground">
            {size?.name}
            {size?.ratio ? <span className="font-mono"> · {size.ratio}</span> : null}
          </span>
        }
      >
        <SizePicker value={values.aspect} onChange={(aspect) => onChange({ aspect })} />
      </Section>
      <Section id="res-h" title="Resolution">
        <ResolutionPicker value={values.resolution} costs={template.creditsCost} balance={balance} onChange={(resolution) => onChange({ resolution })} />
      </Section>
      <p className="flex items-center gap-2 px-4 pt-5 text-caption text-muted-foreground">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 flex-none text-primary" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 8v4.5M12 16h.01" />
        </svg>
        {balanceSentence(balance)}
      </p>
    </>
  )
}

function Section({ id, title, aside, children }: { id: string; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="px-4 pt-6">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id={id} className="text-headline leading-[1.2] font-semibold tracking-[-0.01em]">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

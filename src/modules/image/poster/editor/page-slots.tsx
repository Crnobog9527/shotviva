'use client'

import { useTranslations } from 'next-intl'

import { SlotBox } from '../../workspace/slot-boxes'
import type { SlotPhotos } from '../../workspace/use-photo-batch'
import type { StudioTemplate } from '../use-poster-studio'
import type { PagePhotos } from './block-tabs'

type Props = { template: StudioTemplate; kind: string; photos: SlotPhotos }

const slotsOf = (template: StudioTemplate, kind: string) => {
  const listed = template.poster.kinds.find((item) => item.key === kind)?.slots ?? []
  return template.slots.filter((slot) => listed.includes(slot.key))
}

// A page's upload boxes (ARCHITECTURE §5.3, the named slots of §5.1e): e.g. the prize photo on
// the prize page. Optional; left empty, the model draws the prizes from their text.
export function PageSlots({ template, kind, photos }: Props) {
  const t = useTranslations('app')
  const slots = slotsOf(template, kind)
  if (slots.length === 0) return null
  return (
    <>
      {slots.map((slot) => (
        <section key={slot.key} className="grid gap-3">
          {slots.length > 1 ? (
            <h4 className="flex items-baseline gap-2 text-label font-semibold">
              {slot.label}
              {slot.required ? null : <span className="font-normal text-muted-foreground">{t('workspace.optional')}</span>}
            </h4>
          ) : null}
          <SlotBox slot={slot} photos={photos} />
          <p className="text-caption text-muted-foreground">{slot.help ?? t('poster.slotHint')}</p>
        </section>
      ))}
    </>
  )
}

// The editor's part for a page's uploads: titled by the slot when there is one, else 上传图片.
export function pagePhotos(template: StudioTemplate, photos: SlotPhotos, fallback: string): PagePhotos {
  return {
    render: (kind) => <PageSlots template={template} kind={kind} photos={photos} />,
    count: (kind) => {
      const slots = slotsOf(template, kind)
      if (slots.length === 0) return null
      const label = slots.length === 1 ? slots[0]!.label : fallback
      return { label, filled: slots.filter((slot) => photos.byKey[slot.key]).length, total: slots.length }
    },
  }
}

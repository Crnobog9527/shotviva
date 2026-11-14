'use client'

import { useTranslations } from 'next-intl'

import { SlotBox } from '../../workspace/slot-boxes'
import type { SlotPhotos } from '../../workspace/use-photo-batch'
import type { StudioTemplate } from '../use-poster-studio'

type Props = { template: StudioTemplate; kind: string; photos: SlotPhotos }

// A page's upload boxes (ARCHITECTURE §5.3, the named slots of §5.1e): e.g. the prize photo on
// the prize page. Optional; left empty, the model draws the prizes from their text.
export function PageSlots({ template, kind, photos }: Props) {
  const t = useTranslations('app')
  const listed = template.poster.kinds.find((item) => item.key === kind)?.slots ?? []
  const slots = template.slots.filter((slot) => listed.includes(slot.key))
  if (slots.length === 0) return null
  return (
    <>
      {slots.map((slot) => (
        <section key={slot.key} className="grid gap-3">
          <h3 className="flex items-baseline gap-2 text-label font-semibold">
            {slot.label}
            {slot.required ? null : <span className="font-normal text-muted-foreground">{t('workspace.optional')}</span>}
          </h3>
          <SlotBox slot={slot} photos={photos} />
          <p className="text-caption text-muted-foreground">{slot.help ?? t('poster.slotHint')}</p>
        </section>
      ))}
    </>
  )
}

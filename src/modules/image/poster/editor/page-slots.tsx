'use client'

import { useTranslations } from 'next-intl'

import { SlotBox } from '../../workspace/slot-boxes'
import type { SlotPhotos } from '../../workspace/use-photo-batch'
import type { StudioTemplate } from '../use-poster-studio'
import type { QrCheck } from '../use-qr-check'
import type { PagePhotos } from './block-tabs'
import { slotKeysAt, type SlotPlace } from './slot-places'

type Props = { template: StudioTemplate; place: SlotPlace; photos: SlotPhotos; qrCheck: QrCheck; titled?: boolean }

// kind null is the shared tab: its own part holds the QR code (§5.3 「二维码」).
const placeOf = (kind: string | null): SlotPlace => (kind === null ? 'shared' : { kind })

const slotsAt = (template: StudioTemplate, place: SlotPlace) => {
  const listed = slotKeysAt(template.poster, place)
  return template.slots.filter((slot) => listed.includes(slot.key))
}

// A part's upload boxes (ARCHITECTURE §5.3, the named slots of §5.1e): e.g. the prize photo on
// the prize page, the QR code under what both pages share, the organiser logo in the shared
// header. Optional; left empty, nothing is sent and the model draws as it always has.
export function PageSlots({ template, place, photos, qrCheck, titled = false }: Props) {
  const t = useTranslations('app')
  const slots = slotsAt(template, place)
  if (slots.length === 0) return null
  return (
    <>
      {slots.map((slot) => (
        <section key={slot.key} className="grid gap-3">
          {titled || slots.length > 1 ? (
            <h4 className="flex items-baseline gap-2 text-label font-semibold">
              {slot.label}
              {slot.required ? null : <span className="font-normal text-muted-foreground">{t('workspace.optional')}</span>}
            </h4>
          ) : null}
          <SlotBox slot={slot} photos={photos} />
          <SlotNote help={slot.help} qrCheck={slot.key === template.poster.qr?.slot ? qrCheck : null} />
        </section>
      ))}
    </>
  )
}

// Under the box: the QR code's reading in the browser (use-qr-check.ts), else the slot's help.
function SlotNote({ help, qrCheck }: { help?: string; qrCheck: QrCheck | null }) {
  const t = useTranslations('app.poster')
  if (qrCheck === 'unreadable') return <p role="alert" className="text-caption text-destructive">{t('qrUnreadable')}</p>
  if (qrCheck === 'checking') return <p className="text-caption text-muted-foreground">{t('qrChecking')}</p>
  return <p className="text-caption text-muted-foreground">{help ?? t(qrCheck ? 'qrHint' : 'slotHint')}</p>
}

// The editor's part for a page's uploads: titled by the slot when there is one, else 上传图片;
// and the boxes the shared header carries, under its masthead.
export function pagePhotos(template: StudioTemplate, photos: SlotPhotos, fallback: string, qrCheck: QrCheck): PagePhotos {
  return {
    render: (kind) => <PageSlots template={template} place={placeOf(kind)} photos={photos} qrCheck={qrCheck} />,
    header: () => <PageSlots template={template} place="header" photos={photos} qrCheck={qrCheck} titled />,
    count: (kind) => {
      const slots = slotsAt(template, placeOf(kind))
      if (slots.length === 0) return null
      const label = slots.length === 1 ? slots[0]!.label : fallback
      return { label, filled: slots.filter((slot) => photos.byKey[slot.key]).length, total: slots.length }
    },
  }
}

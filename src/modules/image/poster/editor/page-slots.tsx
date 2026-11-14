'use client'

import { useTranslations } from 'next-intl'

import { SlotBox } from '../../workspace/slot-boxes'
import type { SlotPhotos } from '../../workspace/use-photo-batch'
import type { StudioTemplate } from '../use-poster-studio'
import type { QrCheck } from '../use-qr-check'
import type { PagePhotos } from './block-tabs'

type Props = { template: StudioTemplate; kind: string | null; photos: SlotPhotos; qrCheck: QrCheck }

// kind null is the shared tab: the QR code (§5.3 「二维码」), which every page carries.
const slotsOf = (template: StudioTemplate, kind: string | null) => {
  const qr = template.poster.qr?.slot
  const listed = kind === null ? (qr ? [qr] : []) : template.poster.kinds.find((item) => item.key === kind)?.slots ?? []
  return template.slots.filter((slot) => listed.includes(slot.key))
}

// A tab's upload boxes (ARCHITECTURE §5.3, the named slots of §5.1e): e.g. the prize photo on
// the prize page, the QR code under what both pages share. Optional; left empty, the model draws
// the prizes from their text and the QR box as it always has.
export function PageSlots({ template, kind, photos, qrCheck }: Props) {
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

// The editor's part for a page's uploads: titled by the slot when there is one, else 上传图片.
export function pagePhotos(template: StudioTemplate, photos: SlotPhotos, fallback: string, qrCheck: QrCheck): PagePhotos {
  return {
    render: (kind) => <PageSlots template={template} kind={kind} photos={photos} qrCheck={qrCheck} />,
    count: (kind) => {
      const slots = slotsOf(template, kind)
      if (slots.length === 0) return null
      const label = slots.length === 1 ? slots[0]!.label : fallback
      return { label, filled: slots.filter((slot) => photos.byKey[slot.key]).length, total: slots.length }
    },
  }
}

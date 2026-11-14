'use client'

import { useTranslations } from 'next-intl'

import { SlotBox } from '../../workspace/slot-boxes'
import type { SlotPhotos } from '../../workspace/use-photo-batch'
import type { StudioTemplate } from '../use-poster-studio'
import type { QrCheck } from '../use-qr-check'

type Props = { template: StudioTemplate; kind: string | null; photos: SlotPhotos; qrCheck: QrCheck }

// A tab's upload boxes (ARCHITECTURE §5.3, the named slots of §5.1e): e.g. the prize photo on
// the prize page, and under what both pages share (kind null) the QR code, which every page
// carries. Optional; left empty, the model draws the prizes from their text and the QR code as
// it always has.
export function PageSlots({ template, kind, photos, qrCheck }: Props) {
  const qr = template.poster.qr?.slot
  const listed = kind === null ? (qr ? [qr] : []) : template.poster.kinds.find((item) => item.key === kind)?.slots ?? []
  const slots = template.slots.filter((slot) => listed.includes(slot.key))
  if (slots.length === 0) return null
  return <>{slots.map((slot) => <SlotSection key={slot.key} slot={slot} photos={photos} qrCheck={slot.key === qr ? qrCheck : null} />)}</>
}

type SlotProps = { slot: StudioTemplate['slots'][number]; photos: SlotPhotos; qrCheck: QrCheck | null }

function SlotSection({ slot, photos, qrCheck }: SlotProps) {
  const t = useTranslations('app')
  return (
    <section className="grid gap-3">
      <h3 className="flex items-baseline gap-2 text-label font-semibold">
        {slot.label}
        {slot.required ? null : <span className="font-normal text-muted-foreground">{t('workspace.optional')}</span>}
      </h3>
      <SlotBox slot={slot} photos={photos} />
      {qrCheck === 'unreadable' ? <p role="alert" className="text-caption text-destructive">{t('poster.qrUnreadable')}</p>
        : qrCheck === 'checking' ? <p className="text-caption text-muted-foreground">{t('poster.qrChecking')}</p>
          : <p className="text-caption text-muted-foreground">{slot.help ?? t(qrCheck ? 'poster.qrHint' : 'poster.slotHint')}</p>}
    </section>
  )
}

'use client'

import { useTranslations } from 'next-intl'

import { buttonVariants } from '@/core/ui/button'

import { SIDE_BY_SIDE } from '../result/action-styles'

// "Edit" on a finished photo (T6 comp photo.html: beside Make again, under Share). The Photos
// viewer shows it only when editing is on, and switches to the edit form in place.
export function EditTrigger({ onOpen }: { onOpen(): void }) {
  const t = useTranslations('app.edit')
  return (
    <button type="button" onClick={onOpen} className={buttonVariants({ variant: 'glass', size: 'touch', className: SIDE_BY_SIDE })}>
      <EditIcon />
      {t('open')}
    </button>
  )
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px] text-primary" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4zM13.5 6.5l4 4" />
    </svg>
  )
}

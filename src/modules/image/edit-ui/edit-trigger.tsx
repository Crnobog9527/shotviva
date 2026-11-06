'use client'

import { useTranslations } from 'next-intl'

import { buttonVariants } from '@/core/ui/button'

import { SIDE_BY_SIDE } from '../result/action-styles'
import { useOpenEdit } from './edit-flow'

// "Edit" on a finished photo (T6 comp photo.html: beside Make again, under Share). Renders nothing when
// editing is off, since then there is no EditFlow around it.
export function EditTrigger() {
  const open = useOpenEdit()
  const t = useTranslations('app.edit')
  if (!open) return null
  return (
    <button type="button" onClick={open} className={buttonVariants({ variant: 'glass', size: 'touch', className: SIDE_BY_SIDE })}>
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

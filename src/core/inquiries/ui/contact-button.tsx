'use client'

import dynamic from 'next/dynamic'
import { useCallback, useRef, useState, type ReactNode } from 'react'

import { trackContactSales } from '../../analytics/browser'
import type { InquiryPage } from '../rules'
import type { InquiryCopy } from './copy'
import type { InquiryDialogActions } from './inquiry-dialog'

// The dialog, its form and the sheet code load only when the visitor shows intent (hover, focus
// or press), never with the pricing page (JS budget, Lighthouse).
const loadDialog = () => import('./inquiry-dialog')
const InquiryDialog = dynamic(loadDialog, { ssr: false })

type Props = { copy: InquiryCopy; page: InquiryPage; actions: InquiryDialogActions; className?: string; children: ReactNode }

// "Contact us" under For business (DESIGN §6.9 item 8): sends contact_sales_click (ARCHITECTURE
// §16.2) and opens the inquiry dialog. A dialog whose inquiry went through opens fresh next time.
export function ContactButton({ copy, page, actions, className, children }: Props) {
  const [open, setOpen] = useState(false)
  const [round, setRound] = useState(0)
  const [mounted, setMounted] = useState(false)
  const sent = useRef(false)
  const onSent = useCallback(() => {
    sent.current = true
  }, [])
  const show = () => {
    trackContactSales(page)
    if (sent.current) {
      sent.current = false
      setRound((r) => r + 1)
    }
    setMounted(true)
    setOpen(true)
  }
  return (
    <>
      <button type="button" aria-haspopup="dialog" onClick={show} onPointerEnter={() => void loadDialog()} onFocus={() => void loadDialog()} className={className}>
        {children}
      </button>
      {mounted ? <InquiryDialog key={round} open={open} onOpenChange={setOpen} copy={copy} page={page} actions={actions} onSent={onSent} /> : null}
    </>
  )
}

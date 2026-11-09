'use client'

import { useState, type ReactNode } from 'react'
import { ResponsiveSheet } from '@/core/ui/responsive-sheet'

type Props = { initiallyOpen: boolean; title: string; description: string; children: ReactNode }

export function ApplicationDialog({ initiallyOpen, title, description, children }: Props) {
  const [open, setOpen] = useState(initiallyOpen)
  return (
    <>
      <button type="button" aria-haspopup="dialog" className="af-button" onClick={() => setOpen(true)}>{title}</button>
      <ResponsiveSheet open={open} onOpenChange={setOpen} title={title} description={description} tall>
        {children}
      </ResponsiveSheet>
    </>
  )
}

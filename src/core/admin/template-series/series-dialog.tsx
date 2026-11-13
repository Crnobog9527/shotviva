'use client'

import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'

import { Dialog, DialogContent, DialogTitle } from '@/core/ui/dialog'

import { SERIES_PATH } from './series-row'

// The editor over the list (?id= / ?new=1 stay deep links); closing goes back to the list.
export function SeriesDialog({ title, children }: { title: string; children: ReactNode }) {
  const router = useRouter()
  return (
    <Dialog open onOpenChange={open => !open && router.push(SERIES_PATH, { scroll: false })}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl" aria-describedby={undefined}>
        <DialogTitle>{title}</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  )
}

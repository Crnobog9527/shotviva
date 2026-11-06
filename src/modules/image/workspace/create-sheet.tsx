'use client'

import { XIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Dialog as DialogPrimitive } from 'radix-ui'
import type { ReactNode } from 'react'

import { cn } from '@/core/ui/cn'
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle } from '@/core/ui/drawer'
import { useMediaQuery } from '@/core/ui/use-media-query'

type Props = {
  open: boolean
  onOpenChange(open: boolean): void
  title: string
  description: string
  hint: string
  sample: ReactNode
  // The sample is the tall drag compare (Art Styles), not the 8:5 pair.
  tall: boolean
  // A photo is in: on the phone the sample folds to a 120px strip.
  folded: boolean
  form: ReactNode
  bar: ReactNode
}

// The creation dialog's frame (DESIGN §6.9 item 2, B comp create.html .cd): from 768px a 1040px
// dialog, the template's sample, name and description on a tray on the left, the form scrolling
// on the right over its pinned primary; below 768px a full-height bottom drawer with the
// sample as a strip under the title, the form scrolling and the primary pinned at the bottom.
export function CreateSheet(props: Props) {
  const desktop = useMediaQuery('(min-width: 768px)')
  return desktop ? <DesktopSheet {...props} /> : <PhoneSheet {...props} />
}

function DesktopSheet({ open, onOpenChange, title, description, hint, sample, form, bar }: Props) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="scrim-motion fixed inset-0 z-90 bg-[var(--scrim)] backdrop-blur-[2px]" />
        <DialogPrimitive.Content className="dialog-motion shadow-sheet fixed top-1/2 left-1/2 z-100 grid h-[min(calc(100dvh-64px),880px)] w-[min(1040px,calc(100%-32px))] -translate-1/2 grid-cols-[46fr_54fr] overflow-hidden rounded-panel bg-popover outline-none">
          <div className="no-scrollbar flex min-h-0 flex-col justify-center overflow-y-auto bg-card p-6 shadow-[inset_-1px_0_0_var(--border)]">
            {sample}
            <DialogPrimitive.Title className="pt-5 font-display text-h1 leading-[1.05] tracking-[-0.02em]">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-1.5 text-label text-pretty text-muted-foreground">{description}</DialogPrimitive.Description>
            <p className="mt-2 text-caption text-muted-foreground">{hint}</p>
          </div>
          <div className="flex min-h-0 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-3 pb-4 [&>section:first-child>div:first-child]:pr-14">{form}</div>
            {bar}
          </div>
          <CloseButton Close={DialogPrimitive.Close} className="top-4 right-4" />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function PhoneSheet({ open, onOpenChange, title, description, sample, tall, folded, form, bar }: Props) {
  // The strip: the 8:5 pair up to 40% of the screen, the 4:5 compare up to 46%, 120px once a
  // photo is in (B comp app.css .cd-media).
  const height = folded ? '120px' : tall ? 'min(calc((100vw - 32px) * 5 / 4), 46dvh)' : 'min(calc((100vw - 32px) * 5 / 8), 40dvh)'
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="h-[calc(100dvh-var(--sat)-12px)]">
        <div className="flex-none px-4">
          <DrawerTitle className="mr-12">{title}</DrawerTitle>
          <DrawerDescription className="mt-1 mb-3 text-pretty">{description}</DrawerDescription>
          <div style={{ height }} className={cn('relative overflow-hidden rounded-control transition-[height] duration-350 ease-house', folded && '[&_[aria-hidden=true]]:opacity-0')}>
            {sample}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 [&>section:first-child]:pt-4">{form}</div>
        {bar}
        <CloseButton Close={DrawerClose} className="top-3 right-3" />
      </DrawerContent>
    </Drawer>
  )
}

// 44px target with a 30px disc, like the other sheets.
function CloseButton({ Close, className }: { Close: typeof DialogPrimitive.Close | typeof DrawerClose; className: string }) {
  const t = useTranslations('app.sheet')
  return (
    <Close aria-label={t('close')} className={cn('absolute z-10 grid size-11 place-items-center rounded-full text-bone-dim', className)}>
      <span className="grid size-[30px] place-items-center rounded-full bg-wash-strong">
        <XIcon className="size-4" strokeWidth={2.2} aria-hidden="true" />
      </span>
    </Close>
  )
}

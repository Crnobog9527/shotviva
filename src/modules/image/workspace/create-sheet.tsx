'use client'

import { XIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Dialog as DialogPrimitive } from 'radix-ui'
import type { CSSProperties, ReactNode } from 'react'

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
// sample as a strip under the title, all of it scrolling as one and the primary pinned at the bottom.
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
          <div className="no-scrollbar flex min-h-0 flex-col justify-center-safe overflow-y-auto bg-card p-6 shadow-[inset_-1px_0_0_var(--border)]">
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
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="h-[calc(100dvh-var(--sat)-12px)]">
        {/* One scroll surface, title to options, over the pinned primary: inside the drawer only a
            scroller may pan (vaul sets touch-action: none on the sheet), so a sample above it
            could not be swiped past (Owner 2026-11-08). */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
          <DrawerTitle className="mr-12">{title}</DrawerTitle>
          <DrawerDescription className="mt-1 mb-3 text-pretty">{description}</DrawerDescription>
          <div style={phoneStrip(tall, folded)} className={cn('relative mx-auto overflow-hidden rounded-control transition-[height] duration-350 ease-house', folded && '[&_[aria-hidden=true]]:opacity-0')}>
            {sample}
          </div>
          <div className="[&>section:first-child]:pt-4">{form}</div>
        </div>
        {bar}
        <CloseButton Close={DrawerClose} className="top-3 right-3" />
      </DrawerContent>
    </Drawer>
  )
}

// The strip (B comp app.css .cd-media), at most 40% of the screen so the upload box shows under
// it: the 8:5 pair keeps its shape (narrower and centred once the height cap bites, as in
// landscape), the 4:5 drag compare crops to at most a square. A 120px strip once a photo is in.
function phoneStrip(tall: boolean, folded: boolean): CSSProperties {
  if (folded) return { height: '120px' }
  if (tall) return { height: 'min(calc((100vw - 32px) * 5 / 4), 40dvh)', width: 'min(100%, 40dvh)' }
  return { height: 'min(calc((100vw - 32px) * 5 / 8), 40dvh)', width: 'min(100%, calc(40dvh * 8 / 5))' }
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

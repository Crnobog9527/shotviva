'use client'

import { XIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Dialog as DialogPrimitive } from 'radix-ui'
import type { KeyboardEvent, ReactNode } from 'react'

import { cn } from '@/core/ui/cn'
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from '@/core/ui/drawer'
import { useMediaQuery } from '@/core/ui/use-media-query'

type Props = {
  open: boolean
  onClose(): void
  // The open work's name, the dialog's accessible name.
  title: string
  // Above the body on phones (the position and the step buttons), left of the close button.
  phoneBar?: ReactNode
  onKeyDown?(event: KeyboardEvent<HTMLDivElement>): void
  children: ReactNode
}

// The Photos viewer's frame, the creation dialog's family (DESIGN §6.9 item 2, §8.4): from 768px
// a centred dialog up to 1120 × 880 (the photo tray left, the work's details right); below it a
// full-height bottom drawer that drags down to close. Both trap focus, close on Escape and give
// focus back to the card that opened them. Focus starts on the frame itself, not on its first
// button, so arrows step at once and no control wears a focus ring it was not given.
export function ViewerFrame(props: Props) {
  const desktop = useMediaQuery('(min-width: 768px)')
  return desktop ? <DesktopFrame {...props} /> : <PhoneFrame {...props} />
}

function DesktopFrame({ open, onClose, title, onKeyDown, children }: Props) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="scrim-motion fixed inset-0 z-90 bg-[var(--scrim)] backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          tabIndex={-1}
          onOpenAutoFocus={focusFrame}
          onKeyDown={onKeyDown}
          className="dialog-motion shadow-sheet fixed top-1/2 left-1/2 z-100 flex h-[min(calc(100dvh-48px),880px)] w-[min(1120px,calc(100%-32px))] -translate-1/2 flex-col overflow-hidden rounded-panel bg-popover outline-none"
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          {children}
          <CloseButton Close={DialogPrimitive.Close} className="top-3 right-3" />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function PhoneFrame({ open, onClose, title, phoneBar, onKeyDown, children }: Props) {
  return (
    <Drawer open={open} onOpenChange={(next) => !next && onClose()}>
      <DrawerContent aria-describedby={undefined} tabIndex={-1} onOpenAutoFocus={focusFrame} onKeyDown={onKeyDown} className="h-[calc(100dvh-var(--sat)-12px)]">
        <DrawerTitle className="sr-only">{title}</DrawerTitle>
        <div className="flex min-h-11 flex-none items-center justify-between gap-2 pr-14 pl-2">{phoneBar}</div>
        {children}
        <CloseButton Close={DrawerClose} className="top-7 right-2" />
      </DrawerContent>
    </Drawer>
  )
}

function focusFrame(event: Event) {
  event.preventDefault()
  const frame = event.currentTarget
  if (frame instanceof HTMLElement) frame.focus()
}

// 44px target with a 30px disc, like the other sheets.
function CloseButton({ Close, className }: { Close: typeof DialogPrimitive.Close | typeof DrawerClose; className: string }) {
  const t = useTranslations('app.sheet')
  return (
    <Close aria-label={t('close')} className={cn('absolute z-20 grid size-11 place-items-center rounded-full text-bone-dim', className)}>
      <span className="grid size-[30px] place-items-center rounded-full bg-wash-strong">
        <XIcon className="size-4" strokeWidth={2.2} aria-hidden="true" />
      </span>
    </Close>
  )
}

// The two columns every view of the viewer shares: the photo tray and the side column. On
// phones one scroll surface, photo on top (inside the drawer only a scroller may pan, vaul sets
// touch-action: none on the sheet); from md each column has its own height, the side scrolling.
export const VIEWER_GRID = 'flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain md:grid md:grid-cols-[minmax(0,1fr)_360px] md:overflow-hidden lg:grid-cols-[minmax(0,1fr)_400px]'
export const VIEWER_TRAY = 'relative flex-none px-4 md:flex md:min-h-0 md:items-center md:justify-center md:bg-card md:p-6 md:shadow-[inset_-1px_0_0_var(--border)]'
export const VIEWER_SIDE = 'px-4 pt-4 pb-[calc(var(--sab)+24px)] md:min-h-0 md:overflow-y-auto md:overscroll-contain md:px-6 md:pt-14 md:pb-6'

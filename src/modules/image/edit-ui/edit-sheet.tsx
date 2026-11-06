'use client'

import { XIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Dialog as DialogPrimitive } from 'radix-ui'
import type { ReactNode } from 'react'

import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle } from '@/core/ui/drawer'
import { useMediaQuery } from '@/core/ui/use-media-query'

import { EditPhoto } from './edit-photo'

type Props = {
  open: boolean
  onOpenChange(open: boolean): void
  photo: string
  meta: string
  form: ReactNode
  bar: ReactNode
}

// The edit panel's frame (T6 comp photo.html, same component family as the create dialog):
// below 768px a natural-height bottom drawer with the photo as a 120px strip, the form
// scrolling and the bar fixed; from 768px a 1040px dialog, photo and title left, form right.
export function EditSheet(props: Props) {
  const desktop = useMediaQuery('(min-width: 768px)')
  return desktop ? <DesktopSheet {...props} /> : <PhoneSheet {...props} />
}

function DesktopSheet({ open, onOpenChange, photo, meta, form, bar }: Props) {
  const t = useTranslations('app.edit')
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-90 bg-[var(--scrim)] backdrop-blur-[2px]" />
        <DialogPrimitive.Content className="shadow-sheet fixed top-1/2 left-1/2 z-100 grid max-h-[calc(100dvh-48px)] w-[min(1040px,calc(100%-32px))] -translate-1/2 grid-cols-2 overflow-hidden rounded-panel bg-popover outline-none">
          <div className="grid content-start gap-4 overflow-y-auto border-r border-hairline p-6">
            <EditPhoto src={photo} className="mx-auto aspect-[4/5] max-h-[520px] w-full" />
            <DialogPrimitive.Title className="font-display text-h1 leading-[1.05]">{t('title')}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="-mt-2 text-caption text-muted-foreground">{meta}</DialogPrimitive.Description>
            <p className="text-caption text-bone-dim">{t('hint')}</p>
          </div>
          <div className="flex min-h-0 flex-col p-6 pt-14">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{form}</div>
            {bar}
          </div>
          <CloseButton Close={DialogPrimitive.Close} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function PhoneSheet({ open, onOpenChange, photo, meta, form, bar }: Props) {
  const t = useTranslations('app.edit')
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="flex max-h-[calc(100dvh-64px)] min-h-0 flex-col px-4">
          <DrawerTitle className="mr-12">{t('title')}</DrawerTitle>
          <DrawerDescription className="mt-1">{meta}</DrawerDescription>
          <div className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <EditPhoto src={photo} className="mb-5 h-[120px]" />
            {form}
          </div>
          {bar}
        </div>
        <CloseButton Close={DrawerClose} />
      </DrawerContent>
    </Drawer>
  )
}

// 44px target with a 30px disc, top right, like the other sheets.
function CloseButton({ Close }: { Close: typeof DialogPrimitive.Close | typeof DrawerClose }) {
  const t = useTranslations('app.sheet')
  return (
    <Close aria-label={t('close')} className="absolute top-3 right-3 grid size-11 place-items-center rounded-full text-bone-dim">
      <span className="grid size-[30px] place-items-center rounded-full bg-wash-strong">
        <XIcon className="size-4" strokeWidth={2.2} aria-hidden="true" />
      </span>
    </Close>
  )
}

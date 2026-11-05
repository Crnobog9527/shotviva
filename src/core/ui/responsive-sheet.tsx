"use client"

import { XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { Dialog as DialogPrimitive } from "radix-ui"
import type { ReactNode } from "react"

import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle } from "@/core/ui/drawer"
import { useMediaQuery } from "@/core/ui/use-media-query"

type Props = { open: boolean; onOpenChange(open: boolean): void; title: string; description: string; children: ReactNode }

// shadcn's Responsive Dialog pattern (DESIGN §8.4): one component that is a bottom Drawer
// below md and a centred Dialog from md up. Both return focus to the opener on close.
export function ResponsiveSheet({ open, onOpenChange, title, description, children }: Props) {
  const desktop = useMediaQuery("(min-width: 768px)")
  if (desktop) {
    return (
      <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-90 bg-[var(--scrim)] backdrop-blur-[2px]" />
          <DialogPrimitive.Content className="shadow-sheet fixed top-1/2 left-1/2 z-100 max-h-[calc(100dvh-48px)] w-[min(480px,calc(100%-32px))] -translate-1/2 overflow-y-auto rounded-panel bg-popover p-4 pt-6 outline-none">
            <DialogPrimitive.Title className="pr-12 font-display text-h1 leading-[1.05]">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-1 text-caption text-muted-foreground">{description}</DialogPrimitive.Description>
            <SheetClose Close={DialogPrimitive.Close} />
            {children}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    )
  }
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="overflow-y-auto overscroll-contain px-4 pb-[calc(var(--sab)+16px)]">
          <DrawerTitle className="mr-12">{title}</DrawerTitle>
          <DrawerDescription className="mt-1">{description}</DrawerDescription>
          {children}
        </div>
        <SheetClose Close={DrawerClose} />
      </DrawerContent>
    </Drawer>
  )
}

type CloseComponent = typeof DialogPrimitive.Close | typeof DrawerClose

// 44px close target with a 30px bone disc, top right. vaul keeps its own dialog context, so
// each variant closes with its own Close.
function SheetClose({ Close }: { Close: CloseComponent }) {
  const t = useTranslations("app.sheet")
  return (
    <Close aria-label={t("close")} className="absolute top-3 right-3 grid size-11 place-items-center rounded-full text-bone-dim">
      <span className="grid size-[30px] place-items-center rounded-full bg-wash-strong">
        <XIcon className="size-4" strokeWidth={2.2} aria-hidden="true" />
      </span>
    </Close>
  )
}

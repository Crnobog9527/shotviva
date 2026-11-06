"use client"

import { XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { Dialog as DialogPrimitive } from "radix-ui"
import type { ReactNode } from "react"

import { cn } from "@/core/ui/cn"
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle } from "@/core/ui/drawer"
import { useMediaQuery } from "@/core/ui/use-media-query"

type Props = {
  open: boolean
  onOpenChange(open: boolean): void
  title: string
  description: string
  children: ReactNode
  // The paywall (DESIGN §4.5, comps-v3-b): a 920px dialog / a full-height drawer, with `aside`
  // beside the title from md up and `footer` fixed below the scrolling body.
  wide?: boolean
  aside?: ReactNode
  footer?: ReactNode
}

// shadcn's Responsive Dialog pattern (DESIGN §8.4): one component that is a bottom Drawer
// below md and a centred Dialog from md up. Both return focus to the opener on close.
export function ResponsiveSheet({ open, onOpenChange, title, description, children, wide = false, aside, footer }: Props) {
  const desktop = useMediaQuery("(min-width: 768px)")
  if (desktop) {
    return (
      <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-90 bg-[var(--scrim)] backdrop-blur-[2px]" />
          <DialogPrimitive.Content
            className={cn(
              "shadow-sheet fixed top-1/2 left-1/2 z-100 flex -translate-1/2 flex-col rounded-panel bg-popover outline-none",
              wide ? "max-h-[calc(100dvh-64px)] w-[min(920px,calc(100%-64px))]" : "max-h-[calc(100dvh-48px)] w-[min(480px,calc(100%-32px))]",
            )}
          >
            <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", wide ? "px-7 pt-6 pb-5" : "p-4 pt-6")}>
              <SheetHeading title={title} description={description} aside={aside} Title={DialogPrimitive.Title} Description={DialogPrimitive.Description} />
              {children}
            </div>
            {footer}
            <SheetClose Close={DialogPrimitive.Close} />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    )
  }
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className={wide ? "h-[calc(100dvh-var(--sat)-12px)]" : undefined}>
        <div className={cn("min-h-0 overflow-y-auto overscroll-contain px-4", wide ? "flex-1 pb-5" : "pb-[calc(var(--sab)+16px)]")}>
          <SheetHeading title={title} description={description} aside={aside} Title={DrawerTitle} Description={DrawerDescription} />
          {children}
        </div>
        {footer}
        <SheetClose Close={DrawerClose} />
      </DrawerContent>
    </Drawer>
  )
}

type HeadingProps = {
  title: string
  description: string
  aside: ReactNode
  Title: typeof DialogPrimitive.Title | typeof DrawerTitle
  Description: typeof DialogPrimitive.Description | typeof DrawerDescription
}

// Title and description; an `aside` (the paywall's billing toggle) goes below them on phones
// and to their right from md, clear of the close button.
function SheetHeading({ title, description, aside, Title, Description }: HeadingProps) {
  return (
    <div className={cn(aside ? "md:flex md:items-start md:justify-between md:gap-6 md:pr-12" : undefined)}>
      <div className="min-w-0">
        <Title className={cn("font-display text-h1 leading-[1.05]", aside ? "mr-12 md:mr-0" : "mr-12")}>{title}</Title>
        <Description className={cn("mt-1 text-caption text-muted-foreground", aside && "mt-2 text-body leading-[1.45] md:max-w-[44ch]")}>{description}</Description>
      </div>
      {aside}
    </div>
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

"use client"

import * as React from "react"
import { Drawer as DrawerPrimitive } from "vaul"

import { cn } from "@/core/ui/cn"

// shadcn/ui Drawer (vaul), styled as the Darkroom bottom sheet: Sheet surface, 30px top
// corners, 38×5 grab bar, drag-to-dismiss, black scrim with a light blur (DESIGN §8.4).

function Drawer(props: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  return <DrawerPrimitive.Root data-slot="drawer" {...props} />
}

function DrawerClose(props: React.ComponentProps<typeof DrawerPrimitive.Close>) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />
}

function DrawerOverlay({ className, ...props }: React.ComponentProps<typeof DrawerPrimitive.Overlay>) {
  return (
    <DrawerPrimitive.Overlay
      data-slot="drawer-overlay"
      className={cn("fixed inset-0 z-90 bg-[var(--scrim)] backdrop-blur-[2px]", className)}
      {...props}
    />
  )
}

function DrawerContent({ className, children, ...props }: React.ComponentProps<typeof DrawerPrimitive.Content>) {
  return (
    <DrawerPrimitive.Portal data-slot="drawer-portal">
      <DrawerOverlay />
      <DrawerPrimitive.Content
        data-slot="drawer-content"
        className={cn(
          "shadow-sheet fixed inset-x-0 bottom-0 z-100 flex max-h-[calc(100dvh-var(--sat)-12px)] flex-col rounded-t-sheet bg-popover text-popover-foreground outline-none",
          className
        )}
        {...props}
      >
        <div aria-hidden="true" className="grid h-7 flex-none place-items-center">
          <span className="h-[5px] w-[38px] rounded-full bg-[var(--grab)]" />
        </div>
        {children}
      </DrawerPrimitive.Content>
    </DrawerPrimitive.Portal>
  )
}

function DrawerTitle({ className, ...props }: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return <DrawerPrimitive.Title data-slot="drawer-title" className={cn("font-display text-h1 leading-[1.05]", className)} {...props} />
}

function DrawerDescription({ className, ...props }: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return (
    <DrawerPrimitive.Description data-slot="drawer-description" className={cn("text-caption text-muted-foreground", className)} {...props} />
  )
}

export { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerOverlay, DrawerTitle }

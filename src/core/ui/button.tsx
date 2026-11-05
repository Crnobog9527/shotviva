import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/core/ui/cn"
import { Slot } from "radix-ui"

const buttonCva = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
        // App shell (DESIGN "Buttons"): the one safelight primary per screen, its neutral bone
        // twin for buying ("Get credits"), and the bone-wash ghost for everything else.
        // Wrap rather than overflow: labels change length between languages.
        cta: "w-full whitespace-normal text-center leading-tight press rounded-tile bg-primary text-cta font-semibold tracking-[-0.01em] text-primary-foreground shadow-raised",
        "cta-neutral": "w-full whitespace-normal text-center leading-tight press rounded-tile bg-foreground text-cta font-semibold tracking-[-0.01em] text-background shadow-raised",
        glass: "whitespace-normal text-center leading-tight press hairline rounded-button bg-wash text-label font-semibold tracking-[-0.01em] text-foreground",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
        cta: "min-h-14 px-4 py-2",
        touch: "min-h-11 px-4 py-2",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

// Merged through cn so a variant's corner, size or colour wins over the base classes, and a
// caller's className wins over both (cva alone only concatenates).
const buttonVariants = ({ className, ...variants }: VariantProps<typeof buttonCva> & { className?: string } = {}) =>
  cn(buttonCva(variants), className)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonCva> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }

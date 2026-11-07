'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

import { cn } from '../ui/cn'

// The fixed bottom bar of flow pages: at most one notice line and the one primary (DESIGN
// "Action Bar"). From md up it sits at the end of the content instead (§8.6). The spacer is
// measured from the bar (notice lines and the home-indicator inset vary), so the last section
// always scrolls clear of it on phones. `inline` is the bar pinned under a sheet's scrolling
// body (the creation dialog, T38): no spacer, never fixed, the body fading out above it.
export function ActionBar({ children, className, inline = false }: { children: ReactNode; className?: string; inline?: boolean }) {
  if (inline) {
    return (
      <div
        className={cn(
          'relative flex-none bg-popover px-4 pt-3 pb-[calc(var(--sab)+8px)] shadow-[inset_0_1px_0_var(--border)] md:px-6 md:pt-4 md:pb-6',
          "before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-5 before:bg-[linear-gradient(transparent,var(--popover))] before:content-['']",
          className,
        )}
      >
        {children}
      </div>
    )
  }
  return <FixedBar className={className}>{children}</FixedBar>
}

function FixedBar({ children, className }: { children: ReactNode; className?: string }) {
  const bar = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(160)
  useEffect(() => {
    const element = bar.current
    if (!element) return
    const observer = new ResizeObserver(() => setHeight(element.offsetHeight + 16))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return (
    <>
      <div aria-hidden="true" className="md:hidden" style={{ height }} />
      <div
        ref={bar}
        // The consent bar moves out of its way on phones (core/analytics, T70).
        data-action-bar=""
        className={cn(
          // Fixed only below md, never `fixed` + `md:static`: see the note above TabBar in tab-bar.tsx.
          'action-material z-60 px-4 pt-3 pb-[calc(var(--sab)+12px)] max-md:fixed max-md:inset-x-0 max-md:bottom-0',
          'md:mt-8 md:bg-none md:px-4 md:pb-8 md:shadow-none md:backdrop-blur-none',
          className,
        )}
      >
        {children}
      </div>
    </>
  )
}

// One line above the primary: a 16px ash icon, bone-dim text, the key sentence in bone.
export function ActionNotice({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 flex items-start gap-3 text-caption leading-[1.4] text-bone-dim">
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 flex-none text-muted-foreground" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      <span>{children}</span>
    </p>
  )
}

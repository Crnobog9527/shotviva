import type { ReactNode } from 'react'

import { cn } from '../ui/cn'

// The fixed bottom bar of flow pages: at most one notice line and the one primary (DESIGN
// "Action Bar"). From md up it sits at the end of the content instead (§8.6). The spacer keeps
// the last section clear of the bar on phones.
export function ActionBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <>
      <div aria-hidden="true" className="h-40 md:hidden" />
      <div
        className={cn(
          'action-material fixed inset-x-0 bottom-0 z-60 px-4 pt-3 pb-[calc(var(--sab)+12px)]',
          'md:static md:mt-8 md:bg-none md:px-4 md:pb-8 md:shadow-none md:backdrop-blur-none',
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

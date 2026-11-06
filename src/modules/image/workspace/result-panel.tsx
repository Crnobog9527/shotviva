import type { ReactNode } from 'react'

import { cn } from '@/core/ui/cn'

// The settled message beside the tray (B comp workspace.html / photo.html .panel.result): a
// round mark and one line, then what it means in caption type. A failure is announced.
export function ResultPanel({ tone, title, children, className }: { tone: 'done' | 'fail'; title: ReactNode; children?: ReactNode; className?: string }) {
  const fail = tone === 'fail'
  return (
    <div role={fail ? 'alert' : 'status'} className={cn('hairline grid justify-items-start gap-1 rounded-panel bg-card p-4', className)}>
      <p className="flex items-center gap-2 text-body leading-[1.25] font-semibold">
        <span aria-hidden="true" className={cn('grid size-[22px] flex-none place-items-center rounded-full', fail ? 'bg-destructive/14 text-destructive' : 'bg-success/15 text-success')}>
          <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
            <path d={fail ? 'M6 6l12 12M18 6L6 18' : 'M5 12.5l4.5 4.5L19 7.5'} />
          </svg>
        </span>
        {title}
      </p>
      {children}
    </div>
  )
}

// The cost after the middle dot on a primary: Retry · 2 credits all in mono, as on Generate;
// a size (Download · 1024 px) in caption type with only the number in mono.
export const costTag = (chunks: ReactNode) => <span className="font-mono text-caption font-medium opacity-[.72]">{chunks}</span>
export const sizeTag = (chunks: ReactNode) => <span className="text-caption font-medium opacity-[.72]">{chunks}</span>
export const monoTag = (chunks: ReactNode) => <span className="font-mono">{chunks}</span>

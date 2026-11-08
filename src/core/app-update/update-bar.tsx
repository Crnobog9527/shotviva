'use client'

import { RotateCw, X } from 'lucide-react'

import { Button } from '../ui/button'
import { cn } from '../ui/cn'
import { useBottomClearance } from './use-bottom-clearance'

export type UpdateCopy = { label: string; body: string; refresh: string; close: string; photosLost: string }

type Props = { copy: UpdateCopy; photosHeld: boolean; onRefresh(): void; onDismiss(): void }

// The new-version banner (T90), loaded on demand by UpdateSlot. The cookie bar's floating
// material card (DESIGN §8.4), narrower, centred at the bottom: 12px above the home-indicator
// inset, or 12px above whatever fixed bar is there (useBottomClearance). Under drawers and
// dialogs (z-100), over the tab and action bars (z-60). Refresh is a glass button, not the
// safelight primary: the page keeps its one primary (DESIGN §8.7).
export default function UpdateBar({ copy, photosHeld, onRefresh, onDismiss }: Props) {
  const clearance = useBottomClearance()
  const bottom = clearance > 0 ? `${clearance + 12}px` : 'calc(var(--sab) + 12px)'
  return (
    <section
      role="status"
      aria-label={copy.label}
      data-update-bar=""
      style={{ bottom }}
      className={cn(
        'fixed inset-x-3 z-90 mx-auto flex max-w-[560px] items-center gap-3 py-2.5 pr-1.5 pl-4 transition-[bottom] duration-300',
        'consent-in rounded-tile bg-background/94 backdrop-blur-[24px] backdrop-saturate-[1.4] shadow-[inset_0_0_0_1px_var(--border),inset_0_1px_0_var(--edge-highlight),var(--shadow-sheet)]',
      )}
    >
      <RotateCw className="size-4 flex-none text-primary" aria-hidden />
      <p className="min-w-0 flex-1 text-caption leading-snug text-pretty text-foreground">
        {copy.body}
        {photosHeld ? <span className="mt-0.5 block text-bone-dim">{copy.photosLost}</span> : null}
      </p>
      <Button type="button" variant="glass" size="touch" onClick={onRefresh} className="flex-none px-4">
        {copy.refresh}
      </Button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={copy.close}
        className="press grid size-11 flex-none place-items-center rounded-full text-muted-foreground hover:text-foreground"
      >
        <X className="size-4" aria-hidden />
      </button>
    </section>
  )
}

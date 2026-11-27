'use client'

import { useTranslations } from 'next-intl'

import { cn } from '@/core/ui/cn'

import { useShareSelect } from './select-context'

// Over a Photos tile while picking: one button the size of the tile, so a tap picks the work
// instead of opening it, with a round check in the top corner. Nothing outside select mode.
export function SelectTileButton({ jobId, name }: { jobId: string; name: string }) {
  const select = useShareSelect()
  const t = useTranslations('app.workShare')
  if (!select) return null
  const on = select.isSelected(jobId)
  const blocked = !on && select.full
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={t('select', { name })}
      disabled={blocked}
      onClick={() => select.toggle(jobId)}
      className={cn(
        'absolute inset-0 z-5 rounded-control outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed',
        on ? 'shadow-[inset_0_0_0_2px_var(--primary)]' : 'bg-background/20',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute top-2 right-2 grid size-7 place-items-center rounded-full',
          on ? 'bg-primary text-primary-foreground' : 'frost shadow-[inset_0_0_0_1.5px_var(--photo-ink)]',
        )}
      >
        {on ? (
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        ) : null}
      </span>
    </button>
  )
}

import { useTranslations } from 'next-intl'

import { cn } from '@/core/ui/cn'

// "Phone" / "AI" on every split, the same two words on cards, previews and the generator
// (The Always-Visible Split Rule). Hidden from readers: the image alt already says it.
export function SplitTags({ hidden = false, size = 'card' }: { hidden?: boolean; size?: 'card' | 'large' }) {
  const t = useTranslations('app.template')
  const base = cn(
    'absolute z-2 inline-flex items-center text-caption leading-none font-semibold transition-opacity duration-300',
    size === 'card' ? 'bottom-2 min-h-6 rounded-tag px-2 py-1' : 'top-3 min-h-7 rounded-tag px-3 py-1',
    hidden && 'opacity-0',
  )
  return (
    <>
      <span aria-hidden="true" className={cn(base, 'frost left-2 text-photo-ink', size === 'large' && 'left-3')}>
        {t('phone')}
      </span>
      <span aria-hidden="true" className={cn(base, 'right-2 bg-[var(--safelight-tag)] text-primary-foreground', size === 'large' && 'right-3 bg-primary')}>
        {t('ai')}
      </span>
    </>
  )
}

// The white seam at 50% between the two halves.
export function Seam() {
  return (
    <span
      aria-hidden="true"
      className="absolute inset-y-0 left-1/2 z-2 -ml-px w-[1.5px] bg-[linear-gradient(transparent,var(--photo-ink)_18%,var(--photo-ink)_82%,transparent)]"
    />
  )
}

// 26px frosted badge, top left, on motion cards only (never on still cards, DESIGN §4.2).
export function MotionBadge({ type }: { type: 'animated' | 'video' }) {
  const t = useTranslations('app.template')
  return (
    <span
      aria-label={t(type === 'video' ? 'videoTemplate' : 'animatedTemplate')}
      className="frost absolute top-2 left-2 z-2 grid size-[26px] place-items-center rounded-tag text-photo-ink"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[13px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
        {type === 'video' ? (
          <path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none" />
        ) : (
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
        )}
      </svg>
    </span>
  )
}

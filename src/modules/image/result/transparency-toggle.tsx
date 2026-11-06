'use client'

import { useTranslations } from 'next-intl'

import { cn } from '@/core/ui/cn'

// On-photo toggle (DESIGN "Badges and Tags" material): a 26px frosted tag, solid Bone when
// pressed like a selected chip, hit area extended to 44px. Pressed shows the checkerboard so
// the see-through parts are visible; unpressed is the default white ground.
export function TransparencyToggle({ pressed, onToggle, className }: { pressed: boolean; onToggle(): void; className?: string }) {
  const t = useTranslations('app.result')
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className={cn(
        'press inline-flex h-[26px] items-center gap-1.5 rounded-tag px-2 text-caption leading-none font-medium',
        'after:absolute after:-inset-[9px] after:content-[""]',
        pressed ? 'bg-foreground text-background' : 'frost text-photo-ink',
        className,
      )}
    >
      <CheckerGlyph />
      {t('showTransparency')}
    </button>
  )
}

function CheckerGlyph() {
  return (
    <svg viewBox="0 0 14 14" aria-hidden="true" className="size-3.5" fill="currentColor">
      <rect x="1" y="1" width="6" height="6" rx="1" />
      <rect x="7" y="7" width="6" height="6" rx="1" />
      <rect x="1.5" y="1.5" width="11" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

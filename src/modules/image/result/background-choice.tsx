'use client'

import { useTranslations } from 'next-intl'

import type { DownloadBackground } from '@/core/storage/rules/download-background'
import { cn } from '@/core/ui/cn'

const OPTIONS: { value: DownloadBackground; format: string; swatch: string }[] = [
  { value: 'white', format: 'JPG', swatch: 'bg-photo-white' },
  { value: 'transparent', format: 'PNG', swatch: 'checker-ground [background-size:8px_8px]' },
]

// 白底 / 透明底 for a cut-out's download and Share (ARCHITECTURE §8): two segments right above the
// primary, each with a swatch of the ground and the file type it saves. Only cut-outs show it.
export function BackgroundChoice({ value, onChange, className }: { value: DownloadBackground; onChange(next: DownloadBackground): void; className?: string }) {
  const t = useTranslations('app.result.background')
  return (
    <div role="radiogroup" aria-label={t('label')} className={cn('grid grid-cols-2 gap-1 rounded-control bg-wash p-1 shadow-[inset_0_0_0_1px_var(--border)]', className)}>
      {OPTIONS.map((option) => {
        const checked = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex min-h-11 items-center justify-center gap-2 rounded-inner px-2 text-label font-semibold whitespace-nowrap transition-colors',
              checked ? 'bg-card text-foreground shadow-[inset_0_0_0_1px_var(--input)]' : 'text-bone-dim hover:text-foreground',
            )}
          >
            <span aria-hidden="true" className={cn('size-4 flex-none rounded-[4px] shadow-[inset_0_0_0_1px_var(--border)]', option.swatch)} />
            {t(option.value)}
            <span className="font-mono text-caption font-normal text-muted-foreground">{option.format}</span>
          </button>
        )
      })}
    </div>
  )
}

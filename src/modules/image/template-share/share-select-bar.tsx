'use client'

import { useTranslations } from 'next-intl'

import { TEMPLATE_SHARE_MAX_ITEMS } from '@/core/template-shares/rules'
import { Button } from '@/core/ui/button'

type Props = { count: number; onShare(): void; onCancel(): void }

// The fixed bar of Create's share mode: how many are picked, Cancel, and the one primary
// "Share selected (N)". Above the phone tab bar, at the bottom from md up.
export function ShareSelectBar({ count, onShare, onCancel }: Props) {
  const t = useTranslations('app.templateShare')
  return (
    <div className="fixed inset-x-0 bottom-[calc(var(--sab)+16px)] z-50 px-3 max-md:bottom-[calc(var(--sab)+72px)]">
      <div className="hairline mx-auto grid max-w-[560px] gap-2 rounded-panel bg-popover/95 p-3 shadow-sheet backdrop-blur-xl">
        <div className="flex min-h-9 items-center justify-between gap-3 ps-1">
          <p aria-live="polite" className="text-caption text-bone-dim">
            {count === 0 ? t('pickHint') : count >= TEMPLATE_SHARE_MAX_ITEMS ? t('pickedMax', { count }) : t('pickedCount', { count })}
          </p>
          <button type="button" onClick={onCancel} className="press -my-1 inline-flex min-h-11 items-center rounded-full px-3 text-caption font-medium text-foreground">
            {t('cancel')}
          </button>
        </div>
        <Button variant="cta" size="cta" disabled={count === 0} onClick={onShare}>
          {t('shareSelected', { count })}
        </Button>
      </div>
    </div>
  )
}

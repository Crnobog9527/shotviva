'use client'

import { useTranslations } from 'next-intl'

import { EmptyState } from '@/core/ui/empty-state'

// Saved with nothing saved (我的收藏 opened from the account page, or the last heart just
// taken off): what the heart does, and the way back to every template.
export function SavedEmpty({ onBrowse }: { onBrowse(): void }) {
  const t = useTranslations('app.favorites')
  return (
    <EmptyState
      icon="heart"
      title={t('emptyTitle')}
      body={t('emptyText')}
      action={
        <button type="button" onClick={onBrowse} className="press hairline inline-flex min-h-11 items-center rounded-full bg-wash px-5 text-label font-medium text-foreground hover:bg-wash-strong">
          {t('emptyBrowse')}
        </button>
      }
    />
  )
}

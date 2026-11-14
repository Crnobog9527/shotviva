import { useTranslations } from 'next-intl'

import { buttonVariants } from '../../ui/button'

type Props = { hasMore: boolean; loading: boolean; failed: boolean; onMore(): void }

// The next keyset page of a list (AGENTS §5.1). A failed load keeps what is shown and offers
// the same button again.
export function ShowMore({ hasMore, loading, failed, onMore }: Props) {
  const t = useTranslations('app.wishlist')
  if (!hasMore) return null
  return (
    <div className="grid justify-items-center gap-2 px-4 pt-2">
      {failed && (
        <p role="alert" className="text-caption text-destructive">
          {t('loadFailed')}
        </p>
      )}
      <button type="button" onClick={onMore} disabled={loading} className={buttonVariants({ variant: 'glass', size: 'touch' })}>
        {t(loading ? 'loading' : 'showMore')}
      </button>
    </div>
  )
}

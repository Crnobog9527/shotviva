import { Link } from '../../i18n/ui'
import { useTranslations } from 'next-intl'

import { ActionBar, ActionNotice } from '../../app-shell'
import { buttonVariants } from '../../ui/button'

// The wall is a tab root, so on phones its bar rides just above the fixed tab bar (50px rows
// plus padding and the home-indicator inset) instead of covering it.
const ABOVE_TAB_BAR = 'bottom-[calc(var(--sab)+58px)] pb-3'

// The wall's one primary, fixed in the thumb zone (DESIGN §4.7): "Request a template", or the
// same button greyed with "Create one photo first to join" below the threshold (§15.1).
export function RequestBar({ eligible }: { eligible: boolean }) {
  const t = useTranslations('app.wishlist')
  if (eligible) {
    return (
      <ActionBar className={ABOVE_TAB_BAR}>
        <Link href="/wishlist/new" className={buttonVariants({ variant: 'cta', size: 'cta' })}>
          {t('request')}
        </Link>
      </ActionBar>
    )
  }
  return (
    <ActionBar className={ABOVE_TAB_BAR}>
      <ActionNotice>{t('needPhoto')}</ActionNotice>
      <button type="button" disabled className={buttonVariants({ variant: 'glass', size: 'cta', className: 'w-full rounded-tile text-cta text-muted-foreground' })}>
        {t('request')}
      </button>
    </ActionBar>
  )
}

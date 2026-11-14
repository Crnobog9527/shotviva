import { useTranslations } from 'next-intl'

import { ActionBar, ActionNotice } from '../../app-shell'
import { Link } from '../../i18n/ui'
import { buttonVariants } from '../../ui/button'

// The wall is a tab root, so on phones its bar rides just above the fixed tab bar (50px rows
// plus padding and the home-indicator inset) instead of covering it. It renders after the wall,
// so its phone spacer ends the list; from md up `order-first` lifts it under the lede as a
// content-width button (B comp wishlist.html .cta).
const PLACEMENT = 'max-md:bottom-[calc(var(--sab)+58px)] pb-3 md:order-first md:mt-6 md:px-(--gutter) md:pb-0'
const DESKTOP_WIDTH = 'md:w-auto md:min-w-60 md:px-8'

// The wall's one primary (DESIGN §4.7): "Request a template", or the same button greyed with
// "Create one photo first to join" below the threshold (ARCHITECTURE §15.1).
export function RequestBar({ eligible }: { eligible: boolean }) {
  const t = useTranslations('app.wishlist')
  if (eligible) {
    return (
      <ActionBar className={PLACEMENT}>
        <Link href="/wishlist/new" className={buttonVariants({ variant: 'cta', size: 'cta', className: DESKTOP_WIDTH })}>
          {t('request')}
        </Link>
      </ActionBar>
    )
  }
  return (
    <ActionBar className={PLACEMENT}>
      <ActionNotice>{t('needPhoto')}</ActionNotice>
      <button type="button" disabled className={buttonVariants({ variant: 'cta', size: 'cta', className: `opacity-50 ${DESKTOP_WIDTH}` })}>
        {t('request')}
      </button>
    </ActionBar>
  )
}

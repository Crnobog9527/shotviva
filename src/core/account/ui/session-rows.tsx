import { useTranslations } from 'next-intl'

import { DeleteAccountPanel } from '../../auth/ui'
import { cn } from '../../ui/cn'
import { Chevron, RowsPanel, rowClass } from './rows'

// Sign out and Delete account as the last two rows, Delete in red, with one line on what
// deleting removes. Deleting does not touch Stripe, so a subscriber is told to cancel first.
export function SessionRows({ signOut }: { signOut: () => Promise<void> }) {
  const t = useTranslations('auth.account')
  const note = useTranslations('app.account.session')
  return (
    <>
      <RowsPanel>
        <form action={signOut}>
          <button type="submit" className={rowClass}>
            {t('signOut')}
          </button>
        </form>
        <DeleteAccountPanel className={cn(rowClass, 'text-destructive')}>
          {t('dangerZone')}
          <Chevron className="text-destructive" />
        </DeleteAccountPanel>
      </RowsPanel>
      <p className="mt-2 text-caption leading-[1.4] text-muted-foreground">{note('deleteNote')}</p>
    </>
  )
}

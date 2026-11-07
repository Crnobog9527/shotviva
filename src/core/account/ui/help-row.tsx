'use client'

import { useTranslations } from 'next-intl'

import { openHelp, UnreadDot } from '../../support/ui'
import { RowValue, rowClass } from './rows'

// Support → Open a ticket (comps-v3-b/account.html): opens the Help & feedback dialog over the
// page (T68). With a new reply waiting it opens on My tickets, where the dot is.
export function HelpRow({ unread }: { unread: boolean }) {
  const t = useTranslations('app.account.settings')
  const support = useTranslations('app.support')
  return (
    <button type="button" aria-haspopup="dialog" onClick={() => openHelp({ tab: unread ? 'list' : 'new' })} className={rowClass}>
      <span className="inline-flex items-center gap-2">
        {t('support')}
        {unread ? <UnreadDot label={support('newReply')} /> : null}
      </span>
      <RowValue>{t('openTicket')}</RowValue>
    </button>
  )
}

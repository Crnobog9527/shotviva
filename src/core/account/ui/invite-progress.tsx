'use client'

import { useFormatter, useTranslations } from 'next-intl'

import type { InviteSummary } from '../codes'

export function InviteProgress({ summary }: { summary: InviteSummary }) {
  const t = useTranslations('app.accountCodes.invite')
  const format = useFormatter()
  const { friends, invited, purchasers, earned, rewards_left: left, reward_window_days: days } = summary
  return (
    <>
      <p className="text-body font-medium">{t('stats', { joined: invited, paid: purchasers, earned })}</p>
      <p className="text-caption text-muted-foreground">{days ? t('cap', { left, days }) : t('remaining', { left })}</p>
      {friends.length > 0 && (
        <ul aria-label={t('friends')} className="divide-y divide-hairline">
          {friends.map(f => <li key={f.id} className="flex flex-wrap justify-between gap-2 py-2 text-label">
            <time dateTime={f.registered_at}>{format.dateTime(new Date(f.registered_at), { dateStyle: 'medium' })}</time>
            <span className="text-muted-foreground">{t(f.purchased ? 'purchased' : 'joined')}</span>
          </li>)}
        </ul>
      )}
    </>
  )
}

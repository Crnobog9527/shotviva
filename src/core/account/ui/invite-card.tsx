'use client'

import { useState, useTransition } from 'react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { ChevronDown, UserRoundPlus } from 'lucide-react'

import type { InviteSummary, LoadInvites } from '../codes'
import { localizePath } from '../../i18n/paths'
import type { Locale } from '../../i18n/locales'
import { Button } from '../../ui/button'
import { Group } from './rows'
import { InviteLink } from './invite-link'

type Props = { load: LoadInvites; reward: { inviteeCredits: number; inviterCredits: number } }

export function InviteCard({ load, reward }: Props) {
  const t = useTranslations('app.accountCodes.invite')
  const locale = useLocale() as Locale
  const [summary, setSummary] = useState<InviteSummary | null>(null)
  const [open, setOpen] = useState(false)
  const [failed, setFailed] = useState(false)
  const [busy, start] = useTransition()

  function read(more = false) {
    const last = more && summary ? summary.friends.at(-1) : null
    setFailed(false)
    start(async () => {
      try {
        const result = await load(last ? { id: last.id, created_at: last.created_at } : undefined)
        setSummary({ ...result, friends: last && summary ? [...summary.friends, ...result.friends] : result.friends })
      } catch { setFailed(true) }
    })
  }
  function toggle() {
    setOpen(!open)
    if (!open && !summary && !busy) read()
  }
  return (
    <Group title={t('title')}>
      <div className="hairline-lit rounded-panel bg-card px-4">
        <button type="button" aria-expanded={open} onClick={toggle} className="flex min-h-14 w-full items-center gap-3 text-left font-medium">
          <UserRoundPlus className="size-5 text-primary" aria-hidden />{t('showLink')}
          <ChevronDown aria-hidden className={`ml-auto size-4 ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && <div className="space-y-3 border-t border-hairline py-4" aria-busy={busy}>
          <p className="text-label text-muted-foreground">{t('rule', { invitee: reward.inviteeCredits, inviter: reward.inviterCredits })}</p>
          {summary && <>
            <InviteLink url={new URL(localizePath('/?code=' + summary.code, locale), window.location.origin).href} />
            <p className="text-body font-medium">{t('stats', { joined: summary.invited, paid: summary.purchasers, earned: summary.earned })}</p>
            <p className="text-caption text-muted-foreground">{t('cap', { left: summary.rewards_left })}</p>
            <InviteFriends friends={summary.friends} />
          </>}
          {busy && <p role="status" className="text-caption">{t('loading')}</p>}
          {failed && <p role="alert">{t('failed')}</p>}
          {(failed || (summary && summary.friends.length < summary.invited)) &&
            <Button size="touch" variant="glass" disabled={busy} onClick={() => read(Boolean(summary))}>{t(failed ? 'retry' : 'more')}</Button>}
        </div>}
      </div>
    </Group>
  )
}

function InviteFriends({ friends }: { friends: InviteSummary['friends'] }) {
  const t = useTranslations('app.accountCodes.invite')
  const format = useFormatter()
  if (!friends.length) return null
  return (
    <ul aria-label={t('friends')} className="divide-y divide-hairline">
      {friends.map(f => <li key={f.id} className="flex flex-wrap justify-between gap-2 py-2 text-label">
        <time dateTime={f.registered_at}>{format.dateTime(new Date(f.registered_at), { dateStyle: 'medium' })}</time>
        <span className="text-muted-foreground">{t(f.purchased ? 'purchased' : 'joined')}</span>
      </li>)}
    </ul>
  )
}

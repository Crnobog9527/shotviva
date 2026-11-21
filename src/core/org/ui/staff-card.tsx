'use client'

import dynamic from 'next/dynamic'
import { useState, useTransition } from 'react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'

import type { InviteSummary, LoadInvites } from '@/core/account/codes'
import { localizePath } from '@/core/i18n/paths'
import type { Locale } from '@/core/i18n/locales'
import { Button } from '@/core/ui/button'

import type { StaffCard, StaffLevel } from '../console/types'
import type { StaffActions } from './actions'
import { Confirm } from './confirm'
import { Panel, Result, Stat } from './parts'
import { useConsoleAction } from './use-console-action'

const InviteLink = dynamic(() => import('@/core/account/ui/invite-link').then((m) => m.InviteLink), { ssr: false })

// One level of the member's own customers: how many in all, and this month's new, paying and spend.
function LevelStats({ title, hint, level, unavailable }: { title: string; hint: string; level: StaffLevel | null; unavailable: string }) {
  const t = useTranslations('app.org.staff')
  const format = useFormatter()
  return (
    <div className="space-y-2">
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-caption text-muted-foreground">{hint}</p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label={t('customers')} value={level ? format.number(level.customers) : '—'} note={level ? t('newThisMonth', { count: level.signups }) : undefined} />
        <Stat label={t('paying')} value={level ? format.number(level.paying) : '—'} />
        <Stat label={t('spend')} value={level ? format.number(level.paidCents / 100, { style: 'currency', currency: 'USD' }) : '—'} />
      </div>
      {level ? null : <p className="text-caption text-muted-foreground">{unavailable}</p>}
    </div>
  )
}

// Level 1, and level 2 when the org has it, each with this month's numbers.
function Levels({ data }: { data: StaffCard }) {
  const t = useTranslations('app.org.staff')
  const { performance, period } = data
  return (
    <div className="space-y-4 border-t border-hairline pt-3">
      <LevelStats title={t('level1')} hint={t('level1Hint', { month: period })} level={performance?.l1 ?? null} unavailable={t('statsUnavailable')} />
      {data.withLevel2 ? <LevelStats title={t('level2')} hint={t('level2Hint', { month: period })} level={performance?.l2 ?? null} unavailable={t('statsUnavailable')} /> : null}
    </div>
  )
}

// 「我的企业」 on /account for a member of an org (ARCHITECTURE §6.5, card E4): this month's
// share, the promo link (the member's own invite link, T94), their level-1 / level-2 customers with
// this month's spend (card E5, from the staff variant of org_member_stats: only their own row,
// never a commission), and leaving.
export function StaffCardView({ data, actions, loadInvite }: { data: StaffCard; actions: StaffActions; loadInvite: LoadInvites }) {
  const t = useTranslations('app.org.staff')
  const format = useFormatter()
  const locale = useLocale() as Locale
  const [summary, setSummary] = useState<InviteSummary | null>(null)
  const [failed, setFailed] = useState(false)
  const [loading, startLoading] = useTransition()
  const [leaving, setLeaving] = useState(false)
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const { pending, outcome, run } = useConsoleAction()

  function showLink() {
    setFailed(false)
    startLoading(async () => {
      try { setSummary(await loadInvite()) } catch { setFailed(true) }
    })
  }
  const url = summary ? new URL(localizePath('/?code=' + summary.code, locale), window.location.origin).href : null

  return (
    <Panel title={t('title', { org: data.orgName })} hint={data.status === 'suspended' ? t('suspended') : t('hint')}>
      <div className="grid grid-cols-3 gap-3">
        <Stat label={t('allowance')} value={format.number(data.monthlyAllowance)} />
        <Stat label={t('allocated')} value={format.number(data.allocatedThisMonth)} />
        <Stat label={t('remaining')} value={format.number(data.heldCredits)} />
      </div>
      <div className="space-y-2 border-t border-hairline pt-3">
        <p className="font-medium">{t('promoTitle')}</p>
        <p className="text-label text-muted-foreground">{t('promoHint')}</p>
        {url ? <InviteLink url={url} /> : (
          <Button type="button" size="touch" variant="glass" disabled={loading} onClick={showLink}>{loading ? t('loading') : failed ? t('retry') : t('showLink')}</Button>
        )}
        {failed ? <p role="alert" className="text-label text-destructive">{t('linkFailed')}</p> : null}
      </div>
      <Levels data={data} />
      <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-3">
        <Button type="button" size="touch" variant="glass" disabled={pending} onClick={() => setLeaving(true)}>{t('leave')}</Button>
        <Result outcome={outcome} />
      </div>
      <Confirm
        open={leaving}
        onOpenChange={setLeaving}
        title={t('leaveTitle', { org: data.orgName })}
        description={t('leaveBody')}
        confirm={t('leaveConfirm')}
        cancel={t('cancel')}
        busy={pending}
        onConfirm={() => run(() => actions.leave({ requestId }), t('left'), () => { setRequestId(crypto.randomUUID()); setLeaving(false) })}
      />
    </Panel>
  )
}

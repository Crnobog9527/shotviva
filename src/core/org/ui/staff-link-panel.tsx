'use client'

import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronRight, ShieldAlert, TriangleAlert } from 'lucide-react'

import { ENTERPRISE_LINK_LOCALE } from '@/core/i18n/locales'
import { localizePath } from '@/core/i18n/paths'
import { Link } from '@/core/i18n/ui'
import { Button } from '@/core/ui/button'

import type { OwnerConsole } from '../console/types'
import type { OwnerActions } from './actions'
import { Confirm } from './confirm'
import { InviteLinkBox } from './invite-link-box'
import { Result } from './parts'
import { useConsoleAction } from './use-console-action'

// The staff-only link (Owner 2026-11-22), first thing in the workspace. It is a credential
// that seats whoever opens it as staff, so it wears the caution surface and says plainly that
// customers must get the affiliate's customer link instead. Built with /zh whatever the console's language (ENTERPRISE_LINK_LOCALE).
export function StaffLinkPanel({ data, actions, affiliate }: { data: OwnerConsole; actions: OwnerActions; affiliate: boolean }) {
  const t = useTranslations('app.org.invite')
  const id = useId()
  const [token, setToken] = useState(data.inviteToken)
  const [confirming, setConfirming] = useState(false)
  const { pending, outcome, run } = useConsoleAction()
  const suspended = data.org.status === 'suspended'
  return (
    <section aria-labelledby={id} className="rounded-panel bg-[var(--caution-tint)] p-4 shadow-[inset_0_0_0_1px_var(--caution-edge)]">
      <h2 id={id} className="flex items-center gap-2 text-headline leading-[1.2] font-semibold tracking-[-0.01em]">
        <ShieldAlert aria-hidden strokeWidth={1.75} className="size-5 shrink-0 text-[var(--caution)]" />{t('title')}
      </h2>
      <p className="mt-1 text-label text-bone-dim">{t('hint')}</p>
      <div className="mt-3 space-y-3">
        <InviteLinkBox path={localizePath(`/join/org/${token}`, ENTERPRISE_LINK_LOCALE)} />
        <div role="note" className="flex gap-2.5 rounded-inner bg-background/60 p-3 shadow-[inset_0_0_0_1px_var(--caution-edge)]">
          <TriangleAlert aria-hidden strokeWidth={1.75} className="mt-0.5 size-[18px] shrink-0 text-[var(--caution)]" />
          <div className="min-w-0 space-y-1">
            <p className="text-label font-medium text-[var(--caution)]">{t('warning')}</p>
            {affiliate ? (
              <Link href="/partners/enterprise" className="inline-flex min-h-11 items-center gap-0.5 text-label text-foreground underline underline-offset-4">
                {t('toAffiliate')}<ChevronRight aria-hidden strokeWidth={1.75} className="size-4 text-primary" />
              </Link>
            ) : null}
          </div>
        </div>
        {suspended ? <p role="status" className="text-label text-muted-foreground">{t('suspended')}</p> : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" size="touch" variant="glass" disabled={pending} onClick={() => setConfirming(true)}>{t('reset')}</Button>
          <Result outcome={outcome} />
        </div>
      </div>
      <Confirm
        open={confirming}
        onOpenChange={setConfirming}
        title={t('resetTitle')}
        description={t('resetBody')}
        confirm={t('resetConfirm')}
        cancel={t('cancel')}
        busy={pending}
        onConfirm={() => run(() => actions.resetInvite(), t('resetDone'), (result) => { setToken(result.token); setConfirming(false) })}
      />
    </section>
  )
}

'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { useFormStatus } from 'react-dom'

// 断开 takes two presses: the first asks, the second submits the account page's existing
// disconnect action (it revokes the link and refreshes the page, which turns the card and this
// introduction to 未连接).
export function DisconnectGraylum({ disconnect }: { disconnect: () => Promise<void> }) {
  const t = useTranslations('partner.intro.connection')
  const [confirming, setConfirming] = useState(false)
  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className={`${GHOST} w-fit`}>
        {t('disconnect')}
      </button>
    )
  }
  return (
    <form action={disconnect} className="grid gap-3">
      <p role="alert" className="text-caption leading-[1.45] text-foreground">{t('confirm')}</p>
      <div className="flex flex-wrap gap-2">
        <Submit />
        {/* Focus lands here, so a stray Enter cancels rather than disconnects. */}
        <button type="button" autoFocus onClick={() => setConfirming(false)} className={GHOST}>
          {t('cancel')}
        </button>
      </div>
    </form>
  )
}

function Submit() {
  const t = useTranslations('partner.intro.connection')
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className={`${GHOST} text-destructive disabled:opacity-70`}>
      {pending ? t('disconnecting') : t('confirmDisconnect')}
    </button>
  )
}

const GHOST = 'press inline-flex h-11 items-center rounded-button bg-wash px-4 text-[15px] font-semibold shadow-[inset_0_0_0_1px_var(--border)]'

'use client'

import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { buttonVariants } from '../../ui/button'
import { cn } from '../../ui/cn'
import { ResponsiveSheet } from '../../ui/responsive-sheet'
import { useDeleteAccount } from './use-delete-account'

// "Delete account" opens a bottom sheet on phones and a dialog on desktop (DESIGN §8.4), never
// a native confirm(). Typing DELETE arms the destructive button. The caller styles the trigger
// (the account page's red Session row) and gives its content.
export function DeleteAccountPanel({ className, children }: { className?: string; children: ReactNode }) {
  const t = useTranslations('auth.account')
  const del = useDeleteAccount()
  return (
    <>
      <button type="button" aria-haspopup="dialog" onClick={del.open} className={className}>
        {children}
      </button>
      <ResponsiveSheet open={del.status !== 'idle'} onOpenChange={(open) => !open && del.cancel()} title={t('dangerZone')} description={t('deleteWarning')}>
        <label className="mt-6 flex flex-col gap-2 text-label font-medium">
          {t('deleteTypeLabel')}
          <input
            value={del.typed}
            onChange={(event) => del.setTyped(event.target.value)}
            autoCapitalize="characters"
            autoComplete="off"
            enterKeyHint="done"
            className="h-13 rounded-control border-0 bg-wash-faint px-4 text-body shadow-[inset_0_0_0_1px_var(--input)] focus:shadow-[inset_0_0_0_1.5px_var(--destructive)] focus:outline-none"
          />
        </label>
        {del.status === 'failed' ? (
          <p role="alert" className="mt-3 text-caption text-destructive">
            {del.failure === 'subscription' ? t('deleteSubscriptionFailed') : t('deleteFailed')}
          </p>
        ) : null}
        <button
          type="button"
          disabled={!del.canConfirm}
          onClick={del.confirmDelete}
          className={cn(
            'mt-6',
            del.canConfirm
              ? cn(buttonVariants({ variant: 'cta', size: 'cta' }), 'bg-destructive text-background')
              : buttonVariants({ variant: 'glass', size: 'cta', className: 'w-full rounded-tile text-cta text-muted-foreground' }),
          )}
        >
          {del.status === 'deleting' ? t('deleting') : t('deleteConfirm')}
        </button>
        <button type="button" onClick={del.cancel} className="mt-2 min-h-11 w-full text-label font-medium text-bone-dim">
          {t('cancel')}
        </button>
      </ResponsiveSheet>
    </>
  )
}

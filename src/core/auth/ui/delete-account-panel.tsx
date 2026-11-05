'use client'

import { useTranslations } from 'next-intl'

import { useDeleteAccount } from './use-delete-account'

// Inline confirmation instead of a native confirm() (DESIGN §8.4). T8 moves this into
// the app shell's Drawer/Dialog once that component exists.
export function DeleteAccountPanel() {
  const t = useTranslations('auth.account')
  const del = useDeleteAccount()
  if (del.status === 'idle') {
    return (
      <button type="button" onClick={del.open} className="h-12 w-full rounded-md border border-red-600 text-base text-red-700">
        {t('delete')}
      </button>
    )
  }
  return (
    <div className="flex flex-col gap-3 rounded-md border border-red-600 p-4">
      <p className="text-sm">{t('deleteWarning')}</p>
      <label className="flex flex-col gap-1 text-sm font-medium">
        {t('deleteTypeLabel')}
        <input
          value={del.typed}
          onChange={(event) => del.setTyped(event.target.value)}
          autoCapitalize="characters"
          autoComplete="off"
          enterKeyHint="done"
          className="h-12 rounded-md border border-neutral-300 px-3 text-base"
        />
      </label>
      {del.status === 'failed' ? <p role="alert" className="text-sm">{t('deleteFailed')}</p> : null}
      <button
        type="button"
        disabled={!del.canConfirm}
        onClick={del.confirmDelete}
        className="h-12 w-full rounded-md bg-red-700 text-base font-medium text-white disabled:opacity-50"
      >
        {del.status === 'deleting' ? t('deleting') : t('deleteConfirm')}
      </button>
      <button type="button" onClick={del.cancel} className="h-11 text-sm underline">
        {t('cancel')}
      </button>
    </div>
  )
}

'use client'

import { useState } from 'react'

import { localeOfPath, localizePath } from '../../i18n/paths'

export type DeleteStatus = 'idle' | 'confirming' | 'deleting' | 'failed'
// Why it failed: Stripe would not cancel a subscription (nothing was deleted), or anything else.
export type DeleteFailure = 'subscription' | 'other'

export async function failureOf(response: Response): Promise<DeleteFailure> {
  const body: unknown = await response.json().catch(() => null)
  const code = typeof body === 'object' && body !== null && 'code' in body ? body.code : null
  return code === 'SUBSCRIPTION_CANCEL_FAILED' ? 'subscription' : 'other'
}

// Calls the server route; on success the session is already gone, so a full page load
// (not a client navigation) makes sure nothing cached from the account is shown.
export function useDeleteAccount(endpoint = '/api/account/delete') {
  const [status, setStatus] = useState<DeleteStatus>('idle')
  const [typed, setTyped] = useState('')
  const [failure, setFailure] = useState<DeleteFailure>('other')

  function fail(reason: DeleteFailure) {
    setFailure(reason)
    setStatus('failed')
  }

  async function confirmDelete() {
    setStatus('deleting')
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: typed }),
      })
      if (!response.ok) return fail(await failureOf(response))
      // A hard navigation drops every client cache that still holds account data.
      // The home page of the language the account page was in (/zh from /zh/account).
      window.location.assign(localizePath('/', localeOfPath(window.location.pathname)))
    } catch {
      fail('other')
    }
  }

  return {
    status,
    failure,
    typed,
    setTyped,
    canConfirm: typed === 'DELETE' && status !== 'deleting',
    open: () => setStatus('confirming'),
    cancel: () => {
      setTyped('')
      setStatus('idle')
    },
    confirmDelete,
  }
}

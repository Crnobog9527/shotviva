'use client'

import { useState } from 'react'

import { localeOfPath, localizePath } from '../../i18n/paths'

export type DeleteStatus = 'idle' | 'confirming' | 'deleting' | 'failed'

// Calls the server route; on success the session is already gone, so a full page load
// (not a client navigation) makes sure nothing cached from the account is shown.
export function useDeleteAccount(endpoint = '/api/account/delete') {
  const [status, setStatus] = useState<DeleteStatus>('idle')
  const [typed, setTyped] = useState('')

  async function confirmDelete() {
    setStatus('deleting')
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: typed }),
      })
      if (!response.ok) return setStatus('failed')
      // A hard navigation drops every client cache that still holds account data.
      // The home page of the language the account page was in (/zh from /zh/account).
      window.location.assign(localizePath('/', localeOfPath(window.location.pathname)))
    } catch {
      setStatus('failed')
    }
  }

  return {
    status,
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

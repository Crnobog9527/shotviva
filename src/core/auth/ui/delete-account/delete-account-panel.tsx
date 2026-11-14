'use client'

import dynamic from 'next/dynamic'
import { useState, type ReactNode } from 'react'

import { useDeleteAccount } from './use-delete-account'

const DeleteAccountDialog = dynamic(() => import('./delete-account-dialog').then((m) => m.DeleteAccountDialog), { ssr: false })

// "Delete account" opens a bottom sheet on phones and a dialog on desktop (DESIGN §8.4), never
// a native confirm(). Typing DELETE arms the destructive button. The caller styles the trigger
// (the account page's red Session row) and gives its content.
export function DeleteAccountPanel({ className, children }: { className?: string; children: ReactNode }) {
  const [mounted, setMounted] = useState(false)
  const del = useDeleteAccount()
  return (
    <>
      <button type="button" aria-haspopup="dialog" onClick={() => { setMounted(true); del.open() }} className={className}>
        {children}
      </button>
      {mounted && <DeleteAccountDialog del={del} />}
    </>
  )
}

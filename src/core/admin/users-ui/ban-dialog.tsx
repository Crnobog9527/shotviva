'use client'

import { useState } from 'react'

import { Button } from '@/core/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/core/ui/dialog'
import { Textarea } from '@/core/ui/textarea'

import { USERS_COPY } from './copy'

const COPY = USERS_COPY.actions

type Props = {
  mode: 'ban' | 'unban'
  pending: boolean
  error: string | null
  onCancel: () => void
  onConfirm: (reason: string) => void
}

export function BanDialog({ mode, pending, error, onCancel, onConfirm }: Props) {
  const [reason, setReason] = useState('')
  const ban = mode === 'ban'
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ban ? COPY.banTitle : COPY.unbanTitle}</DialogTitle>
          <DialogDescription>{ban ? COPY.banBody : COPY.unbanBody}</DialogDescription>
        </DialogHeader>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">{COPY.reason}</span>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            {COPY.cancel}
          </Button>
          <Button
            variant={ban ? 'destructive' : 'default'}
            disabled={pending || reason.trim().length === 0}
            onClick={() => onConfirm(reason.trim())}
          >
            {ban ? COPY.confirmBan : COPY.confirmUnban}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

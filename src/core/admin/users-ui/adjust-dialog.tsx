'use client'

import { useLayoutEffect, useState } from 'react'

import { Button } from '@/core/ui/button'
import { DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/core/ui/dialog'
import { Input } from '@/core/ui/input'
import { Textarea } from '@/core/ui/textarea'

import { USERS_COPY } from './copy'

const COPY = USERS_COPY.actions

export type AdjustInput = { pool: 'free' | 'paid'; amount: number; reason: string; idempotencyKey: string }

export type PoolBalances = { free: number; paid: number }

type Props = {
  balances: PoolBalances
  pending: boolean
  error: string | null
  onCancel: () => void
  onConfirm: (input: AdjustInput) => void
}

// One idempotency key per opened dialog: a double click is still one adjustment. The preview
// shows the pool after the change (borrowed from Graylum's admin) so a typo is caught here.
export function AdjustDialog({ balances, pending, error, onCancel, onConfirm }: Props) {
  const [key] = useState(() => crypto.randomUUID())
  const [pool, setPool] = useState<'free' | 'paid'>('free')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  // Radix updates the top dismissable layer in a passive effect. An immediate Escape
  // after reopening must dismiss this form even while the profile still owns that listener.
  useLayoutEffect(() => {
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return
      event.stopPropagation()
      event.preventDefault()
      onCancel()
    }
    window.addEventListener('keydown', dismiss, true)
    return () => window.removeEventListener('keydown', dismiss, true)
  }, [onCancel])
  const value = Number(amount)
  const after = balances[pool] + (Number.isInteger(value) ? value : 0)
  const valid = Number.isInteger(value) && value !== 0 && Math.abs(value) <= 100_000 && reason.trim().length > 0 && after >= 0
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{COPY.adjustTitle}</DialogTitle>
        <DialogDescription>{COPY.adjustBody}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 text-sm">
        <label className="grid gap-1">
          <span className="font-medium">{COPY.pool}</span>
          <select className="h-9 rounded-md border border-input bg-transparent px-3" value={pool} onChange={(e) => setPool(e.target.value === 'paid' ? 'paid' : 'free')}>
            <option value="free">{USERS_COPY.pools.free}</option>
            <option value="paid">{USERS_COPY.pools.paid}</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="font-medium">{COPY.amount}</span>
          <Input type="number" step={1} inputMode="text" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <p className={after < 0 ? 'text-destructive' : 'text-muted-foreground'}>
          {COPY.preview(balances[pool], after)}
        </p>
        <label className="grid gap-1">
          <span className="font-medium">{COPY.reason}</span>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={pending}>
          {COPY.cancel}
        </Button>
        <Button disabled={pending || !valid} onClick={() => onConfirm({ pool, amount: value, reason: reason.trim(), idempotencyKey: key })}>
          {valid ? COPY.adjustConfirm(value, USERS_COPY.pools[pool]) : COPY.adjust}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

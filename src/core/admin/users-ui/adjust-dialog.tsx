'use client'

import { useState } from 'react'

import { Button } from '@/core/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/core/ui/dialog'
import { Input } from '@/core/ui/input'
import { Textarea } from '@/core/ui/textarea'

import { USERS_COPY } from './copy'

const COPY = USERS_COPY.actions

export type AdjustInput = { pool: 'free' | 'paid'; amount: number; reason: string; idempotencyKey: string }

type Props = { pending: boolean; error: string | null; onCancel: () => void; onConfirm: (input: AdjustInput) => void }

// One idempotency key per opened dialog: a double click is still one adjustment.
export function AdjustDialog({ pending, error, onCancel, onConfirm }: Props) {
  const [key] = useState(() => crypto.randomUUID())
  const [pool, setPool] = useState<'free' | 'paid'>('free')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const value = Number(amount)
  const valid = Number.isInteger(value) && value !== 0 && reason.trim().length > 0
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
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
            <Input type="number" step={1} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
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
    </Dialog>
  )
}

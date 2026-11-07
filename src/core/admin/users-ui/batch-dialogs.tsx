'use client'

import { useState, type ReactNode } from 'react'

import { Button } from '@/core/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/core/ui/dialog'
import { Input } from '@/core/ui/input'
import { Textarea } from '@/core/ui/textarea'

import type { UserListRow } from '../users/list-types'
import { BatchPeople } from './batch-people'
import { USERS_COPY } from './copy'

const COPY = USERS_COPY.batch

type Person = Pick<UserListRow, 'id' | 'email' | 'phone'>

// Users the batch was refused for (all or nothing: nobody changed).
export type Rejection = { reason: 'missing' | 'insufficient'; people: Person[] }

type Shared = { people: Person[]; pending: boolean; error: string | null; rejection: Rejection | null; onCancel: () => void }

export type BatchAdjustInput = { pool: 'free' | 'paid'; amount: number; reason: string; batchKey: string }

function Frame({ title, body, shared, children, confirm }: { title: string; body: string; shared: Shared; children?: ReactNode; confirm: ReactNode }) {
  return (
    <Dialog open onOpenChange={(open) => !open && shared.onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <BatchPeople people={shared.people} />
        {children}
        {shared.rejection ? (
          <div role="alert" className="grid gap-2">
            <p className="text-sm text-destructive">{COPY.rejected[shared.rejection.reason]}</p>
            <BatchPeople people={shared.rejection.people} label={COPY.who} />
          </div>
        ) : null}
        {shared.error ? (
          <p role="alert" className="text-sm text-destructive">
            {shared.error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={shared.onCancel} disabled={shared.pending}>
            {USERS_COPY.actions.cancel}
          </Button>
          {confirm}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// One batch key per opened dialog: a double click, or a retry after a lost response, is still
// one adjustment per user (admin_batch_adjust_credits, 0621).
export function BatchAdjustDialog({ shared, onConfirm }: { shared: Shared; onConfirm: (input: BatchAdjustInput) => void }) {
  const [batchKey] = useState(() => crypto.randomUUID())
  const [pool, setPool] = useState<'free' | 'paid'>('paid')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const value = Number(amount)
  const valid = amount.trim() !== '' && Number.isInteger(value) && value !== 0 && Math.abs(value) <= 100_000 && reason.trim().length > 0
  const n = shared.people.length
  const confirm = (
    <Button disabled={shared.pending || !valid} onClick={() => onConfirm({ pool, amount: value, reason: reason.trim(), batchKey })}>
      {valid ? COPY.adjustConfirm(n, value, USERS_COPY.pools[pool]) : COPY.adjust}
    </Button>
  )
  return (
    <Frame title={COPY.adjustTitle(n)} body={COPY.adjustBody} shared={shared} confirm={confirm}>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <label className="grid gap-1">
          <span className="font-medium">{USERS_COPY.actions.pool}</span>
          <select className="h-9 rounded-md border border-input bg-transparent px-3" value={pool} onChange={(e) => setPool(e.target.value === 'free' ? 'free' : 'paid')}>
            <option value="paid">{USERS_COPY.pools.paid}</option>
            <option value="free">{USERS_COPY.pools.free}</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="font-medium">{USERS_COPY.actions.amount}</span>
          <Input type="number" step={1} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="grid gap-1 sm:col-span-2">
          <span className="font-medium">{USERS_COPY.actions.reason}</span>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
      </div>
    </Frame>
  )
}

export function BatchBanDialog({ banned, shared, onConfirm }: { banned: boolean; shared: Shared; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('')
  const n = shared.people.length
  const confirm = (
    <Button variant={banned ? 'destructive' : 'default'} disabled={shared.pending || reason.trim().length === 0} onClick={() => onConfirm(reason.trim())}>
      {banned ? COPY.banConfirm(n) : COPY.unbanConfirm(n)}
    </Button>
  )
  return (
    <Frame title={banned ? COPY.banTitle(n) : COPY.unbanTitle(n)} body={banned ? COPY.banBody : COPY.unbanBody} shared={shared} confirm={confirm}>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">{USERS_COPY.actions.reason}</span>
        <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
    </Frame>
  )
}

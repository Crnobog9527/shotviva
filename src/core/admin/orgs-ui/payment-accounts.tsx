'use client'

import { useState } from 'react'

import { PAYMENT_FIELD_LABELS, PAYMENT_FIELDS, PAYMENT_KIND_LABELS, PAYMENT_KINDS, type PaymentKind } from '@/core/org/payment-labels'
import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'
import { Textarea } from '@/core/ui/textarea'

import { formatBeijing } from '../shell/format'
import { ORGS_COPY as COPY } from '../orgs/copy'
import type { OrgActionResult, PaymentAccountRow } from '../orgs/types'
import { Card, Check, Field, Outcome } from './fields'
import { useOrgAction } from './use-org-action'

export type SavePaymentAction = (input: unknown) => Promise<OrgActionResult<{ updatedAt: string }>>

const LONG = new Set(['bank_address', 'beneficiary_address', 'address', 'remittance_note', 'notes'])

function AccountForm({ kind, saved, save }: { kind: PaymentKind; saved: PaymentAccountRow | undefined; save: SavePaymentAction }) {
  const [updatedAt, setUpdatedAt] = useState(saved?.updatedAt ?? '')
  const [enabled, setEnabled] = useState(saved?.enabled ?? false)
  const [fields, setFields] = useState<Record<string, string>>(saved?.details ?? {})
  const { pending, outcome, run } = useOrgAction()
  return (
    <Card title={PAYMENT_KIND_LABELS[kind].zh} hint={updatedAt ? COPY.payUpdated(formatBeijing(updatedAt) ?? '') : COPY.payNever}>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault()
          run(() => save({ kind, enabled, expectedUpdatedAt: updatedAt, fields }), (result) => { if (result.value) setUpdatedAt(result.value.updatedAt) })
        }}
      >
        <div className="sm:col-span-2"><Check label={COPY.payEnabled} checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /></div>
        {PAYMENT_FIELDS[kind].map((key) => (
          <Field key={key} label={PAYMENT_FIELD_LABELS[key]?.zh ?? key} className={LONG.has(key) ? 'sm:col-span-2' : undefined}>
            {LONG.has(key)
              ? <Textarea rows={2} maxLength={1000} value={fields[key] ?? ''} onChange={(e) => setFields({ ...fields, [key]: e.target.value })} />
              : <Input maxLength={1000} autoComplete="off" value={fields[key] ?? ''} onChange={(e) => setFields({ ...fields, [key]: e.target.value })} />}
          </Field>
        ))}
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={pending}>{pending ? COPY.saving : COPY.paySave}</Button>
          <Outcome outcome={outcome} />
        </div>
      </form>
    </Card>
  )
}

export function PaymentAccounts({ accounts, save }: { accounts: Partial<Record<PaymentKind, PaymentAccountRow>>; save: SavePaymentAction }) {
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">{COPY.payHint}</p>
      {PAYMENT_KINDS.map((kind) => <AccountForm key={kind} kind={kind} saved={accounts[kind]} save={save} />)}
    </div>
  )
}

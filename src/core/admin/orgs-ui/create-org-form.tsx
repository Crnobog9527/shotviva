'use client'

import { useState } from 'react'

import { useRouter } from '@/core/i18n/navigation'
import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'

import { ORGS_COPY as COPY } from '../orgs/copy'
import type { OrgActionResult } from '../orgs/types'
import { Card, Field, Outcome } from './fields'
import { useOrgAction } from './use-org-action'

export type CreateOrgAction = (input: unknown) => Promise<OrgActionResult<{ id: string }>>

export function CreateOrgForm({ create }: { create: CreateOrgAction }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [account, setAccount] = useState('')
  const [note, setNote] = useState('')
  const { pending, outcome, run } = useOrgAction()
  const ready = name.trim() !== '' && account.trim() !== ''
  return (
    <Card title={COPY.createTitle} hint={COPY.createHint}>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (!ready || pending) return
          run(() => create({ name, account, note }), (result) => { if (result.value) router.push(`/admin/orgs/${result.value.id}`) })
        }}
      >
        <Field label={COPY.name}><Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label={COPY.account}>
          <Input value={account} maxLength={254} placeholder={COPY.accountPlaceholder} autoComplete="off" onChange={(e) => setAccount(e.target.value)} />
        </Field>
        <Field label={COPY.note} className="sm:col-span-2"><Input value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={pending || !ready}>{pending ? COPY.saving : COPY.create}</Button>
          <Outcome outcome={outcome} />
        </div>
      </form>
    </Card>
  )
}

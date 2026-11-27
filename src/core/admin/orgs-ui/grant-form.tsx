'use client'

import { useState } from 'react'

import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'

import { ORGS_COPY as COPY } from '../orgs/copy'
import type { OrgActionResult, OrgPackage } from '../orgs/types'
import { Card, Field, Outcome, Select } from './fields'
import { useOrgAction } from './use-org-action'

export type GrantAction = (input: unknown) => Promise<OrgActionResult<{ pool: number }>>

function canGrant(adjust: boolean, credits: string, note: string, packageId: string): boolean {
  if (adjust) return credits.trim() !== '' && note.trim() !== ''
  return credits.trim() !== '' || packageId !== ''
}

// One request id per open form: a double click, or a retry after a lost response, sends the same
// id and the database applies it once. A new id is made only after the grant went through.
export function GrantForm({ orgId, packages, grant }: { orgId: string; packages: OrgPackage[]; grant: GrantAction }) {
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [kind, setKind] = useState<'bank_grant' | 'admin_adjust'>('bank_grant')
  const [packageId, setPackageId] = useState('')
  const [credits, setCredits] = useState('')
  const [cny, setCny] = useState('')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const { pending, outcome, run } = useOrgAction()
  const adjust = kind === 'admin_adjust'
  const chosen = packages.find((p) => p.id === packageId)
  const ready = canGrant(adjust, credits, note, packageId)

  return (
    <Card title={COPY.grantTitle} hint={COPY.grantHint}>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (pending || !ready) return
          run(() => grant({ orgId, requestId, kind, packageId: adjust ? '' : packageId, credits, cny: adjust ? '' : cny, reference, note }), () => {
            setRequestId(crypto.randomUUID())
            setCredits(''); setCny(''); setReference(''); setNote(''); setPackageId('')
          })
        }}
      >
        <Field label={COPY.grantKind}>
          <Select value={kind} onChange={(e) => setKind(e.target.value === 'admin_adjust' ? 'admin_adjust' : 'bank_grant')}>
            <option value="bank_grant">{COPY.kindBank}</option>
            <option value="admin_adjust">{COPY.kindAdjust}</option>
          </Select>
        </Field>
        {adjust ? null : <PackagePick packages={packages} value={packageId} onChange={(id) => { setPackageId(id); setCredits('') }} />}
        <Field label={COPY.credits} hint={adjust ? COPY.creditsAdjustHint : COPY.creditsHint}>
          <Input inputMode={adjust ? 'text' : 'numeric'} value={credits} placeholder={chosen ? String(chosen.credits) : ''} onChange={(e) => setCredits(e.target.value)} />
        </Field>
        {adjust ? null : <Field label={COPY.receivedCny}><Input inputMode="decimal" value={cny} onChange={(e) => setCny(e.target.value)} /></Field>}
        <Field label={COPY.reference}><Input value={reference} maxLength={200} onChange={(e) => setReference(e.target.value)} /></Field>
        <Field label={COPY.grantNote}><Input value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={pending || !ready}>{pending ? COPY.saving : COPY.grant}</Button>
          <Outcome outcome={outcome} />
        </div>
      </form>
    </Card>
  )
}

function PackagePick({ packages, value, onChange }: { packages: OrgPackage[]; value: string; onChange: (id: string) => void }) {
  return (
    <Field label={COPY.package}>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{COPY.packageNone}</option>
        {packages.filter((p) => p.active || p.id === value).map((p) => (
          <option key={p.id} value={p.id}>{p.name} · {p.credits}</option>
        ))}
      </Select>
    </Field>
  )
}

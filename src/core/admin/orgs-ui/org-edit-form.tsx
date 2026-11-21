'use client'

import { useState } from 'react'

import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'

import { ORGS_COPY as COPY, USAGE_FIELDS, type UsageField } from '../orgs/copy'
import type { LimitCaps, OrgActionResult, OrgRow } from '../orgs/types'
import { Card, Check, Field, Outcome, Select } from './fields'
import { useOrgAction } from './use-org-action'

export type SaveOrgAction = (input: unknown) => Promise<OrgActionResult<{ updatedAt: string }>>

function usageText(org: OrgRow): Record<UsageField, string> {
  const show = (value: number | null) => (value === null ? '' : String(value))
  return { concurrency: show(org.concurrency), per_window: show(org.perWindow), batch_max: show(org.batchMax), multi_template_max: show(org.multiTemplateMax) }
}

export function OrgEditForm({ org, caps, save }: { org: OrgRow; caps: LimitCaps; save: SaveOrgAction }) {
  const [updatedAt, setUpdatedAt] = useState(org.updatedAt)
  const [name, setName] = useState(org.name)
  const [status, setStatus] = useState(org.status)
  const [note, setNote] = useState(org.adminNote ?? '')
  const [usage, setUsage] = useState(usageText(org))
  const [batchZip, setBatchZip] = useState(org.batchZip)
  const [earlyFeatures, setEarlyFeatures] = useState(org.earlyFeatures)
  const [affiliateEnabled, setAffiliateEnabled] = useState(org.affiliateEnabled)
  const [levels, setLevels] = useState<1 | 2>(org.affiliateLevels)
  const [rotateInvite, setRotateInvite] = useState(false)
  const { pending, outcome, run } = useOrgAction()

  return (
    <Card title={COPY.editTitle}>
      <form
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          run(
            () => save({
              id: org.id, expectedUpdatedAt: updatedAt, name, status, note, ...usage,
              batchZip, earlyFeatures, affiliateEnabled, affiliateLevels: levels, rotateInvite,
            }),
            (result) => {
              if (result.value) setUpdatedAt(result.value.updatedAt)
              setRotateInvite(false)
            },
          )
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={COPY.name}><Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label={COPY.status} hint={COPY.statusHint}>
            <Select value={status} onChange={(e) => setStatus(e.target.value === 'suspended' ? 'suspended' : 'active')}>
              <option value="active">{COPY.statusActive}</option>
              <option value="suspended">{COPY.statusSuspended}</option>
            </Select>
          </Field>
          <Field label={COPY.note} className="sm:col-span-2"><Input value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>

        <fieldset className="grid gap-3">
          <legend className="font-medium">{COPY.usageTitle}</legend>
          <p className="text-sm text-muted-foreground">{COPY.usageHint}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {USAGE_FIELDS.map(({ key, label }) => (
              <Field key={key} label={label} hint={COPY.capLabel(caps[key])}>
                <Input
                  inputMode="numeric" value={usage[key]} placeholder="—"
                  onChange={(e) => setUsage({ ...usage, [key]: e.target.value })}
                />
              </Field>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-6">
            <Check label={COPY.batchZip} checked={batchZip} onChange={(e) => setBatchZip(e.target.checked)} />
            <Check label={COPY.earlyFeatures} checked={earlyFeatures} onChange={(e) => setEarlyFeatures(e.target.checked)} />
          </div>
        </fieldset>

        <fieldset className="grid gap-3">
          <legend className="font-medium">{COPY.affiliateTitle}</legend>
          <Check label={COPY.affiliateEnabled} checked={affiliateEnabled} onChange={(e) => setAffiliateEnabled(e.target.checked)} />
          <Field label={COPY.affiliateLevels} className="sm:max-w-xs">
            <Select value={levels} disabled={!affiliateEnabled} onChange={(e) => setLevels(e.target.value === '2' ? 2 : 1)}>
              <option value="1">{COPY.level1}</option>
              <option value="2">{COPY.level2}</option>
            </Select>
          </Field>
          <p className="text-xs text-muted-foreground">{COPY.affiliateRatesNote}</p>
        </fieldset>

        <Check label={COPY.rotateInvite} checked={rotateInvite} onChange={(e) => setRotateInvite(e.target.checked)} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>{pending ? COPY.saving : COPY.save}</Button>
          <Outcome outcome={outcome} />
        </div>
      </form>
    </Card>
  )
}

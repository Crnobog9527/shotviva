'use client'

import { useState } from 'react'

import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'

import { ORGS_COPY as COPY } from '../orgs/copy'
import type { OrgActionResult, OrgRow } from '../orgs/types'
import { Card, Field, Outcome } from './fields'
import { useOrgAction } from './use-org-action'

export type SaveSignupBonusAction = (input: unknown) => Promise<OrgActionResult<{ updatedAt: string }>>

// Extra free credits for new users who sign up through this org's staff invite links (1690).
// Its own form and its own SQL function, with the same stale-form check as the org settings.
export function SignupBonusForm({ org, max, given, save }: { org: OrgRow; max: number; given: number; save: SaveSignupBonusAction }) {
  const [updatedAt, setUpdatedAt] = useState(org.updatedAt)
  const [credits, setCredits] = useState(String(org.signupBonusCredits))
  const { pending, outcome, run } = useOrgAction()
  return (
    <Card title={COPY.bonusTitle} hint={COPY.bonusRules}>
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          run(() => save({ id: org.id, expectedUpdatedAt: updatedAt, credits }), (result) => {
            if (result.value) setUpdatedAt(result.value.updatedAt)
          })
        }}
      >
        <Field label={COPY.bonusLabel} hint={COPY.bonusHint(max)} className="sm:max-w-md">
          <Input inputMode="numeric" value={credits} placeholder="0" onChange={(e) => setCredits(e.target.value)} />
        </Field>
        <p className="text-xs text-muted-foreground">{COPY.bonusGiven(given)}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>{pending ? COPY.saving : COPY.save}</Button>
          <Outcome outcome={outcome} />
        </div>
      </form>
    </Card>
  )
}

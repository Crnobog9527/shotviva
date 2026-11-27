'use client'

import { useState } from 'react'

import { IP_LIMIT_MAX, IP_LIMIT_MIN } from '@/core/system-settings/registry'
import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'

import type { SignupLimits } from '../system-settings/types'
import type { ActionResult } from '../templates/types'
import { useAdminAction } from '../shell/use-admin-action'
import { SIGNUP_LIMITS_COPY as COPY } from './signup-limits-copy'

type Props = {
  limits: SignupLimits
  save: (input: SignupLimits) => Promise<ActionResult>
}

const FIELDS = ['signupHourly', 'signupDaily', 'signupHourlyPartner', 'signupDailyPartner', 'smsDaily', 'smsDailyPartner'] as const
type Field = (typeof FIELDS)[number]
const whole = (value: string) => /^\d+$/.test(value) && Number(value) >= IP_LIMIT_MIN && Number(value) <= IP_LIMIT_MAX

// 2027 (ARCHITECTURE §7): the per-IP sign-up and SMS limits, site-wide and through an org ?ref link.
export function SignupLimitsCard({ limits, save }: Props) {
  const [values, setValues] = useState<Record<Field, string>>(
    () => Object.fromEntries(FIELDS.map((field) => [field, String(limits[field])])) as Record<Field, string>,
  )
  const { pending, error, notice, run } = useAdminAction()
  const valid = FIELDS.every((field) => whole(values[field]))
  const input = Object.fromEntries(FIELDS.map((field) => [field, Number(values[field])])) as SignupLimits
  const changed = FIELDS.some((field) => input[field] !== limits[field])

  const submit = () =>
    run(
      async () => {
        const result = await save(input)
        return result.ok ? { ok: true as const, value: undefined } : result
      },
      () => COPY.saved,
    )

  return (
    <section id="signup_ip_limits" className="grid scroll-mt-20 gap-4 rounded-lg border border-border bg-card p-4" aria-labelledby="signup-ip-limits-title">
      <div className="grid gap-1">
        <h2 id="signup-ip-limits-title" className="font-medium">
          {COPY.title}
        </h2>
        <p className="text-sm text-muted-foreground">{COPY.body}</p>
      </div>
      <form
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          if (valid) submit()
        }}
      >
        {FIELDS.map((field) => (
          <label key={field} className="grid gap-1 text-sm">
            <span className="font-medium">
              {COPY[field].label} <span className="font-mono text-xs font-normal text-muted-foreground">{COPY[field].key}</span>
            </span>
            <Input
              className="w-32"
              inputMode="numeric"
              value={values[field]}
              onChange={(event) => setValues((current) => ({ ...current, [field]: event.target.value.trim() }))}
              aria-invalid={!whole(values[field])}
            />
            <span className="text-muted-foreground">{COPY[field].help}</span>
          </label>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending || !valid || !changed}>
            {COPY.save}
          </Button>
          {!valid ? <p className="text-sm text-destructive">{COPY.invalid}</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {notice ? (
            <p className="text-sm text-muted-foreground" role="status">
              {notice}
            </p>
          ) : null}
        </div>
      </form>
    </section>
  )
}

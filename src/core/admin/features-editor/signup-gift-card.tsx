'use client'

import { useState } from 'react'

import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'

import type { SignupGiftRules, SignupGiftState, WishlistSwitchInput } from '../system-settings/types'
import type { ActionResult } from '../templates/types'
import { useAdminAction } from '../shell/use-admin-action'
import { SettingSwitchCard } from './setting-switch-card'
import { SIGNUP_GIFT_COPY, SIGNUP_GIFT_PAUSE_COPY } from './signup-gift-copy'

type Props = {
  state: SignupGiftState
  savePaused: (input: WishlistSwitchInput) => Promise<ActionResult>
  saveRules: (input: SignupGiftRules) => Promise<ActionResult>
}

const COPY = SIGNUP_GIFT_COPY.rules
const whole = (value: string, max: number) => /^\d+$/.test(value) && Number(value) <= max

// 1350 + 1410 (ARCHITECTURE §7): today's count against the daily cap, then every signup gift
// rule in one form with its plain-language explanation, and the pause on its own card.
export function SignupGiftCard({ state, savePaused, saveRules }: Props) {
  const [cap, setCap] = useState(String(state.rules.cap))
  const [perIp, setPerIp] = useState(String(state.rules.perIp))
  const [claimPhone, setClaimPhone] = useState(state.rules.claimPhone)
  const [claimGoogle, setClaimGoogle] = useState(state.rules.claimGoogle)
  const { pending, error, notice, run } = useAdminAction()
  const valid = whole(cap, 100_000) && whole(perIp, 1000)
  const rules: SignupGiftRules = { cap: Number(cap), perIp: Number(perIp), claimPhone, claimGoogle }
  const changed = JSON.stringify(rules) !== JSON.stringify(state.rules)

  const submit = () =>
    run(
      async () => {
        const result = await saveRules(rules)
        return result.ok ? { ok: true as const, value: undefined } : result
      },
      () => COPY.saved,
    )

  return (
    <>
      <section className="grid gap-4 rounded-lg border border-border bg-card p-4" aria-labelledby="signup-gift-rules-title">
        <div className="grid gap-1">
          <h2 id="signup-gift-rules-title" className="font-medium">
            {COPY.title}
          </h2>
          <p className="text-sm text-muted-foreground">{COPY.body}</p>
        </div>
        <p className="text-sm font-medium" data-signup-gift-today>
          {COPY.today(state.granted, state.rules.cap)}
        </p>
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            if (valid) submit()
          }}
        >
          <NumberRule copy={COPY.cap} value={cap} onChange={setCap} valid={whole(cap, 100_000)} />
          <NumberRule copy={COPY.perIp} value={perIp} onChange={setPerIp} valid={whole(perIp, 1000)} />
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">{COPY.claim.label}</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={claimPhone} onChange={(event) => setClaimPhone(event.target.checked)} />
              <span>{COPY.claim.phone}</span>
              <span className="font-mono text-xs text-muted-foreground">{COPY.claim.phoneKey}</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={claimGoogle} onChange={(event) => setClaimGoogle(event.target.checked)} />
              <span>{COPY.claim.google}</span>
              <span className="font-mono text-xs text-muted-foreground">{COPY.claim.googleKey}</span>
            </label>
            <p className="text-sm text-muted-foreground">{COPY.claim.help}</p>
          </fieldset>
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
      <SettingSwitchCard copy={SIGNUP_GIFT_PAUSE_COPY} value={state.paused} save={savePaused} />
    </>
  )
}

type RuleCopy = { label: string; key: string; help: string }

function NumberRule({ copy, value, onChange, valid }: { copy: RuleCopy; value: string; onChange: (value: string) => void; valid: boolean }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium">
        {copy.label} <span className="font-mono text-xs font-normal text-muted-foreground">{copy.key}</span>
      </span>
      <Input className="w-32" inputMode="numeric" value={value} onChange={(event) => onChange(event.target.value.trim())} aria-invalid={!valid} />
      <span className="text-muted-foreground">{copy.help}</span>
    </label>
  )
}

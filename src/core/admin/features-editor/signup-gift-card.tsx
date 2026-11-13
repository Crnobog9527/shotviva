'use client'

import { useState } from 'react'

import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'

import type { SignupGiftState, WishlistSwitchInput } from '../system-settings/types'
import type { ActionResult } from '../templates/types'
import { useAdminAction } from '../shell/use-admin-action'
import { SettingSwitchCard } from './setting-switch-card'
import { SIGNUP_GIFT_COPY, SIGNUP_GIFT_PAUSE_COPY } from './signup-gift-copy'

type Props = {
  state: SignupGiftState
  savePaused: (input: WishlistSwitchInput) => Promise<ActionResult>
  saveCap: (input: { cap: number }) => Promise<ActionResult>
}

const COPY = SIGNUP_GIFT_COPY.cap

// 1350 (ARCHITECTURE §7): today's count against the daily cap, the cap itself, and the pause.
export function SignupGiftCard({ state, savePaused, saveCap }: Props) {
  const [cap, setCap] = useState(String(state.cap))
  const { pending, error, notice, run } = useAdminAction()
  const value = Number(cap)
  const valid = /^\d+$/.test(cap) && value <= 100_000

  const submit = () =>
    run(
      async () => {
        const result = await saveCap({ cap: value })
        return result.ok ? { ok: true as const, value: undefined } : result
      },
      () => COPY.saved(value),
    )

  return (
    <>
      <section className="grid gap-4 rounded-lg border border-border bg-card p-4" aria-labelledby="signup-gift-cap-title">
        <div className="grid gap-1">
          <h2 id="signup-gift-cap-title" className="font-medium">
            {COPY.title}
          </h2>
          <p className="font-mono text-xs text-muted-foreground">{COPY.key}</p>
          <p className="text-sm text-muted-foreground">{COPY.body}</p>
        </div>
        <p className="text-sm font-medium">{COPY.today(state.granted, state.cap)}</p>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            if (valid) submit()
          }}
        >
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">{COPY.label}</span>
            <Input className="w-32" inputMode="numeric" value={cap} onChange={(event) => setCap(event.target.value.trim())} aria-invalid={!valid} />
          </label>
          <Button type="submit" disabled={pending || !valid || value === state.cap}>
            {COPY.save}
          </Button>
          {!valid ? <p className="text-sm text-destructive">{COPY.invalid}</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {notice ? (
            <p className="text-sm text-muted-foreground" role="status">
              {notice}
            </p>
          ) : null}
        </form>
      </section>
      <SettingSwitchCard copy={SIGNUP_GIFT_PAUSE_COPY} value={state.paused} save={savePaused} />
    </>
  )
}

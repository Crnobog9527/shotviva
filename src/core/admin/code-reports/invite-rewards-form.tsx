'use client'

import { useActionState } from 'react'

import { MAX_INVITE_REWARD, type InviteRewards } from '../../codes'
import { Button } from '../../ui/button'
import { Input } from '../../ui/input'
import { COPY } from './copy'

export type SaveRewards = (expected: InviteRewards, previous: string, form: FormData) => Promise<string>

export function InviteRewardsForm({ rewards, save }: { rewards: InviteRewards; save: SaveRewards }) {
  const [message, submit, busy] = useActionState(save.bind(null, rewards), '')
  return <section id="rewards" className="grid gap-3 rounded-lg border bg-card p-4" aria-labelledby="reward-heading">
    <h2 id="reward-heading" className="font-semibold">{COPY.settings}</h2>
    <p className="text-sm">{COPY.settingsNote}</p>
    <form action={submit} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {(['inviteeCredits', 'inviterCredits'] as const).map(key => <label key={key} className="grid gap-1 text-sm">
          {key === 'inviteeCredits' ? COPY.signupReward : COPY.firstPaymentReward}
          <Input type="number" name={key} required min={0} max={MAX_INVITE_REWARD} step={1}
            defaultValue={rewards[key]} disabled={busy} />
        </label>)}
      </div>
      <p className="text-sm text-muted-foreground">{COPY.settingsRange}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>{busy ? COPY.running : COPY.saveRewards}</Button>
        <span role="status" className="text-sm">{message}</span>
      </div>
    </form>
  </section>
}

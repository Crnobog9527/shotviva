'use client'

import { useId, useState } from 'react'

import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'

import type { ActionResult } from '../templates/types'
import { useAdminAction } from '../shell/use-admin-action'
import type { FeatureAccessInput, FeatureSetting } from '../features/types'
import { FEATURES_COPY as COPY } from './copy'
import { AUDIENCES, isDirty, toForm, toInput, type FeatureForm } from './form-state'

type Props = { setting: FeatureSetting; save: (input: FeatureAccessInput) => Promise<ActionResult> }

// One registered feature: who may use it and when it opens to everyone. Saves on its own, so
// changing one feature never resubmits another.
export function FeatureCard({ setting, save }: Props) {
  const [form, setForm] = useState<FeatureForm>(() => toForm(setting))
  const { pending, error, notice, run } = useAdminAction()
  const dateId = useId()
  const gated = form.audience !== 'all'

  const submit = () =>
    run(
      async () => {
        const result = await save(toInput(setting.key, form))
        return result.ok ? { ok: true as const, value: undefined } : result
      },
      () => COPY.saved(setting.name),
    )

  return (
    <section className="grid gap-4 rounded-lg border border-border bg-card p-4">
      <div>
        <h2 className="font-medium">{setting.name}</h2>
        <p className="font-mono text-xs text-muted-foreground">{setting.key}</p>
      </div>
      <fieldset className="grid gap-2 text-sm">
        <legend className="mb-2 font-medium">{COPY.who}</legend>
        <div className="flex flex-wrap gap-2">
          {AUDIENCES.map((audience) => (
            <label
              key={audience}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-border px-3 has-checked:border-primary has-checked:bg-primary/10"
            >
              <input
                type="radio"
                name={`${setting.key}-audience`}
                value={audience}
                checked={form.audience === audience}
                onChange={() => setForm((f) => ({ ...f, audience }))}
              />
              {COPY.tiers[audience]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-1 text-sm">
        <label htmlFor={dateId} className="font-medium">
          {COPY.openAt}
        </label>
        <Input
          id={dateId}
          type="datetime-local"
          className="max-w-64"
          disabled={!gated}
          value={gated ? form.openAt : ''}
          onChange={(event) => setForm((f) => ({ ...f, openAt: event.target.value }))}
        />
        <p className="text-xs text-muted-foreground">{gated ? COPY.openAtHint : COPY.openAtDisabled}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={pending || !isDirty(setting, form)} onClick={submit}>
          {pending ? COPY.saving : COPY.save}
        </Button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
      </div>
    </section>
  )
}

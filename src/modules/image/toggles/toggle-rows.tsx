'use client'

import { useId } from 'react'

import { cn } from '@/core/ui/cn'

import type { CatalogueToggle } from '../catalogue/catalogue-template'
import type { ToggleValues } from './toggle-state'

type Props = { toggles: readonly CatalogueToggle[]; values: ToggleValues; onRequest(key: string, on: boolean): void; compact?: boolean }

// One row per toggle (DESIGN §4.3, under the text fields): the name and its one-line hint, a
// switch on the right. The whole row is the 44px+ target; off until the user turns it on. Ids are
// per instance: the home page mounts the phone card and the desktop bench at once.
export function ToggleRows({ toggles, values, onRequest, compact = false }: Props) {
  const idPrefix = useId()
  return (
    <div className={cn('grid', compact ? 'gap-2' : 'gap-3')}>
      {toggles.map((toggle) => {
        const on = values[toggle.key] === true
        const id = `${idPrefix}-${toggle.key}`
        const hint = toggle.hint && !compact ? toggle.hint : null
        return (
          <button
            key={toggle.key}
            type="button"
            role="switch"
            aria-checked={on}
            aria-labelledby={`${id}-label`}
            aria-describedby={hint ? `${id}-hint` : undefined}
            onClick={() => onRequest(toggle.key, !on)}
            className={cn(
              'press flex w-full items-center gap-3 rounded-control bg-wash-faint text-left shadow-[inset_0_0_0_1px_var(--input)] transition-shadow focus-visible:shadow-[inset_0_0_0_1.5px_var(--primary),0_0_0_4px_var(--safelight-halo)] focus-visible:outline-none',
              compact ? 'min-h-11 px-3 py-2' : 'min-h-13 p-4',
            )}
          >
            <span className="min-w-0 flex-1">
              <span id={`${id}-label`} className="block text-label leading-[1.3] font-medium text-foreground">
                {toggle.label}
              </span>
              {hint ? (
                <span id={`${id}-hint`} className="mt-1 block text-caption leading-[1.35] text-muted-foreground">
                  {hint}
                </span>
              ) : null}
            </span>
            <Track on={on} />
          </button>
        )
      })}
    </div>
  )
}

function Track({ on }: { on: boolean }) {
  return (
    <span aria-hidden="true" className={cn('relative inline-flex h-7 w-12 flex-none items-center rounded-full transition-colors duration-200', on ? 'bg-primary' : 'bg-wash-strong')}>
      <span className={cn('absolute left-0.5 size-6 rounded-full bg-background shadow-sm transition-transform duration-200 ease-house', on && 'translate-x-5')} />
    </span>
  )
}

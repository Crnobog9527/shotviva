import { CheckIcon } from 'lucide-react'

import { cn } from '@/core/ui/cn'

// The review list's 20px check mark (drawn, not a native input: its button carries the state).
export function CheckBox({ state }: { state: 'on' | 'off' | 'some' }) {
  return (
    <span aria-hidden="true" className={cn('grid size-5 flex-none place-items-center rounded-[6px] transition-colors', state === 'off' ? 'shadow-[inset_0_0_0_1.5px_var(--input)]' : 'bg-foreground text-background')}>
      {state === 'on' ? <CheckIcon className="size-3" strokeWidth={3.4} /> : null}
      {state === 'some' ? <span className="h-0.5 w-2.5 rounded-full bg-background" /> : null}
    </span>
  )
}

// The state a check button announces: a group or "select all" with some of its rows picked is
// neither on nor off.
export const pressedOf = (state: 'on' | 'off' | 'some') => (state === 'some' ? 'mixed' : state === 'on')

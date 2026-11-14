'use client'

import type { FormWeekly } from './use-form-weekly'
import { LastRow, StoreRow } from './weekly-rows'

// 每周复用 at the top of the creation form (§5.3): 用上一期, and the store details when the template
// has fields they fill.
export function FormWeeklyTools({ weekly, names, storeFields }: { weekly: FormWeekly; names: Record<string, string>; storeFields: boolean }) {
  if (!weekly.peek) return null
  return (
    <div className="grid gap-2 pb-4">
      <LastRow last={weekly.peek.last} reused={weekly.reused} busy={weekly.busy} failed={weekly.failed} dirty={weekly.dirty} onTake={() => void weekly.takeLast()} names={names} />
      {storeFields ? (
        <StoreRow store={weekly.store} filled={weekly.filled} autofill={weekly.autofill} conflicts={weekly.conflicts}
          onFill={weekly.fill} onUndo={weekly.undo} onAutofillOff={weekly.autofillOff} />
      ) : null}
    </div>
  )
}

'use client'

import { LastRow, StoreRow } from '../../again/weekly-rows'
import type { PosterStudioState } from '../use-poster-studio'
import type { PosterWeekly } from '../use-poster-weekly'

type Props = { studio: PosterStudioState; weekly: PosterWeekly; names: Record<string, string> }

// 每周复用 at the top of the poster editor (§5.3): 用上一期, and the store details.
export function WeeklyTools({ studio, weekly, names }: Props) {
  if (!weekly.peek) return null
  const origin = studio.draft.origin
  return (
    <div className="grid gap-2">
      <LastRow last={weekly.peek.last} reused={origin?.source === 'reuse' ? origin : null} busy={weekly.lastBusy} failed={weekly.lastFailed}
        dirty={weekly.dirty} onTake={() => void weekly.takeLast()} names={names} />
      <StoreRow store={weekly.store} filled={weekly.storeNote !== null} autofill={weekly.autofill} conflicts={weekly.storeConflicts}
        onFill={weekly.fillStore} onUndo={weekly.undoStore} onAutofillOff={weekly.autofillOff} />
    </div>
  )
}

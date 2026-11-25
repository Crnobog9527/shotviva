import type { CaseStripEntry } from '@/core/templates/home-case-strip'

import type { DisplayLocale } from '../locale-display/types'
import type { ActionResult } from '../templates/types'

// 首页「更多真实案例」 (migration 2006): one language's whole list, in order; empty goes back to the
// page's built-in row.
export type SaveCaseStripInput = { locale: DisplayLocale; entries: CaseStripEntry[] }

export type CaseStripActions = {
  save: (input: SaveCaseStripInput) => Promise<ActionResult>
}

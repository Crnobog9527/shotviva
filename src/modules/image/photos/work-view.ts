import type { Balance } from '@/core/billing/pools'
import type { ImageOptions } from '@/core/templates/image-options'
import type { CreditsCost } from '@/core/templates/pricing'

import type { PhotoDetail } from '../detail/photo-detail'
import type { EditParent } from '../result/edited-from'
import type { PhotoItem } from './photo-item'
import type { PosterWork } from './poster-work'

// One finished work in the Photos viewer (GET /api/photos/[jobId]): plain JSON, no image bytes
// (AGENTS §6), only the addresses the browser loads them from.
export type WorkView = {
  item: PhotoItem
  detail: PhotoDetail
  // For an edit: the work it was made from (when it still exists) and the words it was asked with.
  parent: EditParent | null
  parentDeleted: boolean
  change: string | null
  // Make again has a template to open (not an edit, the template still in the catalogue).
  againable: boolean
  // Editing (T30) when it is on: its price and options, and what the account can spend now.
  edit: { creditsCost: CreditsCost; imageOptions: ImageOptions; balance: Balance; concurrency: number } | null
  shareText: string
  // A dense-text poster (§5.3): its text check and Redraw; such a work has no Make again or Edit.
  poster: PosterWork | null
}

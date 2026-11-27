import { MEMBERSHIP_TIERS, type SiteProduct } from '../../config'
import { pricingV2 } from '../../public-env'
import { memberPackOff, packNoteValues } from './perks'

type Translate = (key: 'packsNote' | 'packsNoteV2', values?: Record<string, string | number>) => string

// The line above the packs: the member discounts of the listed M / L packs (each revision has its
// own, migration 1610), or the plain note while none is live.
export function packNote(t: Translate, packs: readonly SiteProduct[]): string {
  const off = pricingV2 ? memberPackOff(packs) : null
  return off && MEMBERSHIP_TIERS.some((tier) => off[tier] > 0) ? t('packsNoteV2', packNoteValues(off)) : t('packsNote')
}

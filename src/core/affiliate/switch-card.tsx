'use client'

import { SettingSwitchCard } from '@/core/admin/features-editor/setting-switch-card'
import type { WishlistSwitchInput } from '@/core/admin/system-settings/types'
import type { ActionResult } from '@/core/admin/templates/types'

import { AFFILIATE_OFF_NOTE, AFFILIATE_SWITCH_COPY } from './switch-copy'

// The program's master switch on 联盟营销: the same card and confirmation as the other switches.
// affiliate_settings keeps no editor or time for it, so the card says so instead of a last change.
export function AffiliateSwitchCard({ enabled, save }: {
  enabled: boolean
  save: (input: WishlistSwitchInput) => Promise<ActionResult>
}) {
  return (
    <SettingSwitchCard
      copy={AFFILIATE_SWITCH_COPY}
      value={{ enabled, updatedAt: null, updatedByEmail: null }}
      note={enabled ? null : AFFILIATE_OFF_NOTE}
      save={save}
    />
  )
}

'use client'

import type { ActionResult } from '../templates/types'
import { EmptyState } from '../shell/admin-blocks'
import type { FeatureAccessInput, FeatureSetting } from '../features/types'
import { FEATURES_COPY as COPY } from './copy'
import { FeatureCard } from './feature-card'

export type FeatureAdminActions = { save: (input: FeatureAccessInput) => Promise<ActionResult> }

export function FeaturesEditor({ settings, actions }: { settings: FeatureSetting[]; actions: FeatureAdminActions }) {
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">{COPY.intro}</p>
      {settings.length === 0 ? (
        <EmptyState title={COPY.empty} body={COPY.emptyBody} />
      ) : (
        settings.map((setting) => <FeatureCard key={setting.key} setting={setting} save={actions.save} />)
      )}
    </div>
  )
}

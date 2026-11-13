import type { SupabaseClient } from '@supabase/supabase-js'

import type { ImageCapabilities } from '../templates/image-capabilities'
import { findProviderRow } from './repository'

// Whether a provider row's saved capabilities accept an output ratio. /api/generate refuses a
// template-bound request this says no to (validateStoredCapabilities), so any page that offers
// ratios for a bound template uses the same rule. A row without saved capabilities accepts all.
export function storedAspectAccepted(caps: ImageCapabilities | null | undefined, aspect: string): boolean {
  if (!caps) return true
  if (aspect === 'original') return caps.originalRatio
  const fixed: readonly string[] = caps.providerAspectRatios ?? caps.aspectRatios
  return fixed.includes(aspect)
}

// The ratio check for one template's route. A template on the default provider is not checked
// against saved capabilities when it generates, so nothing is narrowed for it here either.
export async function templateAspectFilter(db: SupabaseClient, templateId: string): Promise<(aspect: string) => boolean> {
  const { data, error } = await db.from('template_prompts').select('provider_id').eq('template_id', templateId).maybeSingle<{ provider_id: string | null }>()
  if (error) throw new Error(`template_prompts read failed: ${error.message}`)
  if (!data?.provider_id) return () => true
  const row = await findProviderRow(db, data.provider_id)
  return (aspect) => storedAspectAccepted(row.capabilities, aspect)
}

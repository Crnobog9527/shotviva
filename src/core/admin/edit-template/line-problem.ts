import { providerFloor, type ProviderFloors } from '@/core/templates/provider-pricing'
import { EDIT_TEMPLATE_ID } from '@/core/templates/edit-params'

// 「出图模型」 (ARCHITECTURE §5.2): a bound line must be one the floor table lists and whose
// capabilities are confirmed, or the floor below cannot be checked. The database checks the rest
// with the same rules as every template: the one input image against the line's reference range,
// priced tiers against its supported ones, prices against its floor.
export function editLineProblem(floor: ProviderFloors, providerId: string | null): string | null {
  if (!providerId) return null
  if (!floor.providers?.[providerId]) return '所选出图模型不存在或已停用，请刷新后重选'
  if (providerFloor(floor, providerId, EDIT_TEMPLATE_ID).unknownCapabilities) return '所选模型的能力尚未确认，请先在供应商页同步'
  return null
}

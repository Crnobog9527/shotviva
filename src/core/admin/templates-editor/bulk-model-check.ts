import type { ImageCapabilities } from '@/core/templates/image-capabilities'
import type { Resolution } from '@/core/templates/output-options'
import type { ImageProviderOption } from '../image-provider-field'
import type { BulkEditFailure, BulkEditPatch } from '../templates/bulk-edit-rules'
import type { AdminTemplate } from '../templates/types'

type Candidate = Pick<AdminTemplate, 'id' | 'name' | 'module' | 'prompt' | 'fields'>

function fitsInputs(t: Candidate, count: number, caps: ImageCapabilities | null) {
  if (!t.fields.images && !count) return true
  const { min, max } = t.fields.images ?? { min: 0, max: 0 }
  const minimum = caps?.minReferences ?? 0
  const maximum = caps?.maxReferences ?? 4
  return min + count >= minimum && max + count <= maximum
}

function fitsRatios(t: Candidate, caps: ImageCapabilities | null) {
  const ratios = caps?.providerAspectRatios ?? caps?.aspectRatios
  return !ratios || (t.fields.aspectRatios ?? []).every(ratio => ratios.includes(ratio))
}

function replacementProblem(t: Candidate, provider: ImageProviderOption | undefined) {
  if (!t.prompt) return '缺少提示词'
  if (t.module !== 'image') return '仅图片模板支持出图模型'
  if (!provider || (!provider.capabilities && !provider.openAI)) return '所选模型的能力尚未确认'
  if (!fitsInputs(t, t.prompt.styleRefs.length, provider.capabilities)) return '用户照片与画风参考图总数超出模型范围'
  if (!fitsRatios(t, provider.capabilities)) return '所选模型不支持模板配置的比例'
}

export function bulkModelFailures(templates: readonly Candidate[], patch: BulkEditPatch, providers: readonly ImageProviderOption[]): BulkEditFailure[] {
  const edited = Object.keys(patch.creditsCost ?? {}) as Resolution[]
  const active = providers.find(provider => provider.isActive)
  return templates.flatMap(t => {
    const id = patch.providerId === undefined ? t.prompt?.providerId : patch.providerId
    const provider = id ? providers.find(option => option.id === id) : active
    const resolutions = provider?.floor.resolutions
    const unsupported = resolutions && edited.some(tier => !resolutions.includes(tier))
    const detail = unsupported ? '所选模型不支持所填积分档位' : patch.providerId !== undefined && replacementProblem(t, provider)
    return detail ? [{ id: t.id, name: t.name, reason: 'model', detail }] : []
  })
}

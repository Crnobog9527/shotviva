import type { AdminTemplate, SaveTemplatePayload } from '../templates/types'

export type TemplateFormValues = {
  id: string
  module: 'image' | 'video'
  name: string
  category: string
  creditsCost: string
  coverBeforeUrl: string
  coverAfterUrl: string
  visibleWeb: boolean
  visiblePartner: boolean
  fieldsJson: string
  promptBody: string
  modelParamsJson: string
}

const DEFAULT_FIELDS = {
  images: { min: 1, max: 1 },
  copy: [],
  aspectRatios: ['1:1', '4:5'],
}

const pretty = (value: unknown) => JSON.stringify(value, null, 2)

export function emptyFormValues(): TemplateFormValues {
  return {
    id: '',
    module: 'image',
    name: '',
    category: '',
    creditsCost: '1',
    coverBeforeUrl: '',
    coverAfterUrl: '',
    visibleWeb: true,
    visiblePartner: false,
    fieldsJson: pretty(DEFAULT_FIELDS),
    promptBody: '',
    modelParamsJson: '{}',
  }
}

export function toFormValues(template: AdminTemplate): TemplateFormValues {
  return {
    id: template.id,
    module: template.module,
    name: template.name,
    category: template.category,
    creditsCost: String(template.creditsCost),
    coverBeforeUrl: template.coverBeforeUrl ?? '',
    coverAfterUrl: template.coverAfterUrl ?? '',
    visibleWeb: template.visibleIn.includes('web'),
    visiblePartner: template.visibleIn.includes('partner'),
    fieldsJson: pretty(template.fields),
    promptBody: template.prompt?.body ?? '',
    modelParamsJson: pretty(template.prompt?.modelParams ?? {}),
  }
}

type BuildResult = { ok: true; payload: SaveTemplatePayload } | { ok: false; message: string }

function parseJson(text: string, label: string): { ok: true; value: unknown } | { ok: false; message: string } {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false, message: `${label} 不是合法的 JSON` }
  }
}

// Only shapes the payload; the server validates every field again with zod.
export function buildPayload(values: TemplateFormValues, isNew: boolean): BuildResult {
  const fields = parseJson(values.fieldsJson, '字段定义')
  if (!fields.ok) return fields
  const modelParams = parseJson(values.modelParamsJson, '模型参数')
  if (!modelParams.ok) return modelParams
  const visibleIn = [values.visibleWeb && 'web', values.visiblePartner && 'partner'].filter(Boolean)
  if (visibleIn.length === 0) return { ok: false, message: '至少选择一个展示入口' }
  return {
    ok: true,
    payload: {
      isNew,
      template: {
        id: values.id.trim(),
        module: values.module,
        name: values.name,
        category: values.category,
        creditsCost: Number(values.creditsCost),
        coverBeforeUrl: values.coverBeforeUrl.trim(),
        coverAfterUrl: values.coverAfterUrl.trim(),
        visibleIn,
        fields: fields.value,
      },
      prompt: { body: values.promptBody, modelParams: modelParams.value },
    },
  }
}

export function moveId(ids: string[], index: number, direction: -1 | 1): string[] | null {
  const target = index + direction
  if (index < 0 || index >= ids.length || target < 0 || target >= ids.length) return null
  const next = [...ids]
  ;[next[index], next[target]] = [next[target] as string, next[index] as string]
  return next
}

export function matchesSearch(template: AdminTemplate, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [template.id, template.name, template.category].some((text) => text.toLowerCase().includes(q))
}

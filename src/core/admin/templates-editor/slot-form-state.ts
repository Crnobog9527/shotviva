import type { ImageSlot } from '@/core/templates/image-slots'

import type { AdminTemplate } from '../templates/types'

// The 图片格子 section of the template editor (ARCHITECTURE §5.1e): one card per
// fields.images.slots entry with its English and Chinese text. On save the cards become
// fields.images (min = required slots, max = slots) and translations.zh.fields.<key>; without
// cards, images comes from the fields JSON box as before.

export type SlotFormValue = {
  key: string
  label: string
  labelZh: string
  help: string
  helpZh: string
  required: boolean
  // The paired text field's key, '' for none.
  note: string
  // false: a poster's QR code, pasted by code and never sent to the model (§5.3). No control of
  // its own: set in the fields JSON (templates:apply) and carried through a save unchanged.
  sendToModel?: false
}

export const emptySlot = (): SlotFormValue => ({ key: '', label: '', labelZh: '', help: '', helpZh: '', required: false, note: '' })

export function toSlotValues(template: AdminTemplate): SlotFormValue[] {
  const zh = template.translations.zh?.fields ?? {}
  return (template.fields.images.slots ?? []).map((slot) => ({
    key: slot.key, label: slot.label, labelZh: zh[slot.key]?.label ?? '', help: slot.help ?? '', helpZh: zh[slot.key]?.help ?? '',
    required: slot.required, note: slot.note ?? '', ...(slot.sendToModel === false ? { sendToModel: false as const } : {}),
  }))
}

const trimmed = (value: string) => value.trim()
const optional = (key: string, value: string) => (trimmed(value) ? { [key]: trimmed(value) } : {})

// The fields JSON box shows images without the slots the cards own.
export function withoutSlots<T extends object>(fields: T): T {
  const images = (fields as { images?: unknown }).images
  if (typeof images !== 'object' || images === null || !('slots' in images)) return fields
  const rest = { ...(images as Record<string, unknown>) }
  delete rest.slots
  return { ...fields, images: rest }
}

// fields.images as the server validates it: with cards, the counts follow them.
export function toImages(slots: readonly SlotFormValue[], fromJson: unknown): unknown {
  if (slots.length === 0) return typeof fromJson === 'object' && fromJson !== null ? withoutSlots({ images: fromJson }).images : fromJson
  const stored: ImageSlot[] = slots.map((slot) => ({
    key: trimmed(slot.key), label: trimmed(slot.label), ...optional('help', slot.help), required: slot.required, ...optional('note', slot.note),
    ...(slot.sendToModel === false ? { sendToModel: false } : {}),
  }) as ImageSlot)
  return { min: stored.filter((slot) => slot.required).length, max: stored.length, slots: stored }
}

// translations.zh.fields.<key> for each card: only filled-in text.
export function toZhSlotText(slots: readonly SlotFormValue[]): Record<string, { label?: string; help?: string }> {
  return Object.fromEntries(slots.flatMap((slot) => {
    const entry = { ...optional('label', slot.labelZh), ...optional('help', slot.helpZh) }
    return Object.keys(entry).length > 0 ? [[trimmed(slot.key), entry]] : []
  }))
}

// Said before the round trip; the server checks again (templateFieldsSchema).
export function slotSetupProblems(slots: readonly SlotFormValue[], copyKeys: readonly string[], partner: boolean): string[] {
  if (slots.length === 0) return []
  const keys = slots.map((slot) => trimmed(slot.key))
  const notes = slots.map((slot) => trimmed(slot.note)).filter(Boolean)
  return [
    ...(partner ? ['有图片格子的模板只能在站内用，请取消「伙伴（partner）」'] : []),
    ...[...new Set(keys.filter((key, at) => key && keys.indexOf(key) !== at))].map((key) => `格子 key「${key}」重复了`),
    ...keys.filter((key) => key && copyKeys.includes(key)).map((key) => `格子 key「${key}」和文字字段重名了`),
    ...[...new Set(notes.filter((note, at) => notes.indexOf(note) !== at))].map((note) => `文字字段「${note}」只能挂在一个格子下面`),
    ...slots.flatMap((slot, index) => {
      const name = trimmed(slot.key) || `第 ${index + 1} 个格子`
      return [
        ...(/^[a-z][a-z0-9_]*$/.test(trimmed(slot.key)) ? [] : [`${name}：key 只能用小写字母、数字、下划线，且以字母开头`]),
        ...(trimmed(slot.key) === 'image_slots' ? [`${name}：image_slots 是保留的占位符`] : []),
        ...(trimmed(slot.label) ? [] : [`${name}：缺英文名称`]),
        ...(trimmed(slot.note) && !copyKeys.includes(trimmed(slot.note)) ? [`${name}：挂的文字字段「${trimmed(slot.note)}」不存在`] : []),
      ]
    }),
  ]
}

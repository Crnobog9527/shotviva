import { DESCRIPTION_MAX, IMAGES_MIN } from '../rules'

export type Slot = { id: number; key: string | null }

// Submit only once every photo field has finished uploading (no half-sent request) and the
// trimmed description is 1–300 characters (ARCHITECTURE §15.1).
export function canSubmit(slots: readonly Slot[], description: string): boolean {
  const uploaded = slots.filter((slot) => slot.key !== null).length
  const text = description.trim()
  return uploaded >= IMAGES_MIN && uploaded === slots.length && text.length > 0 && text.length <= DESCRIPTION_MAX
}

export const uploadedKeys = (slots: readonly Slot[]): string[] => slots.flatMap((slot) => (slot.key ? [slot.key] : []))

export const nextSlotId = (slots: readonly Slot[]): number => Math.max(-1, ...slots.map((slot) => slot.id)) + 1

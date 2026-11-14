import { DESCRIPTION_MAX, IMAGES_MAX, IMAGES_MIN } from '../rules'

// One photo tile of the request form: `picked` once a photo is in it, `key` once that photo is
// uploaded. The open tile is the one empty tile at the end.
export type Slot = { id: number; key: string | null; picked: boolean }

const pickedSlots = (slots: readonly Slot[]) => slots.filter((slot) => slot.picked)

// Submit only once every picked photo has finished uploading (no half-sent request), there are
// 1–3 of them, and the trimmed description is 1–300 characters (ARCHITECTURE §15.1).
export function canSubmit(slots: readonly Slot[], description: string): boolean {
  const picked = pickedSlots(slots)
  const uploaded = picked.filter((slot) => slot.key !== null).length
  const text = description.trim()
  return uploaded >= IMAGES_MIN && uploaded <= IMAGES_MAX && uploaded === picked.length && text.length > 0 && text.length <= DESCRIPTION_MAX
}

export const uploadedKeys = (slots: readonly Slot[]): string[] => slots.flatMap((slot) => (slot.picked && slot.key ? [slot.key] : []))

export const nextSlotId = (slots: readonly Slot[]): number => Math.max(-1, ...slots.map((slot) => slot.id)) + 1

// The picked tiles in order, then exactly one open tile while fewer than three are picked. The
// open tile keeps its id (and so its component) when it is still there.
export function settleSlots(slots: readonly Slot[]): Slot[] {
  const picked = pickedSlots(slots)
  if (picked.length >= IMAGES_MAX) return picked.slice(0, IMAGES_MAX)
  const open = slots.find((slot) => !slot.picked) ?? { id: nextSlotId(slots), key: null, picked: false }
  return [...picked, open]
}

// Tiles left to fill, for the open tile's line: "up to 3", then "2 left", "1 left".
export const tilesLeft = (slots: readonly Slot[]): number => IMAGES_MAX - pickedSlots(slots).length

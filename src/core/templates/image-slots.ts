import { z } from 'zod'

import { AppError } from '../errors'

// Named image slots (ARCHITECTURE §5.1e, Owner 2026-11-12): a template may ask for up to four
// images, each in its own clearly labelled upload box (e.g. "Venue logo", "1st prize photo"),
// so a user cannot put a photo in the wrong place. The filled slots go to the model in the
// order they are defined, and the prompt learns which image is which through {{image_slots}}.
// Stored in templates.fields.images.slots (jsonb, no migration). A template without slots keeps
// the count-based single upload. No `server-only`: the editor, the workspace and the scripts
// share these shapes. Nothing here is specific to one kind of template.

export const IMAGE_SLOTS_MAX = 4
export const IMAGE_SLOTS_PLACEHOLDER = 'image_slots'

// Strict: an unknown key is refused, so a later property is added here as optional, and every
// saved template stays valid without it (as `sendToModel` was).
export const imageSlotSchema = z.strictObject({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  // English; also what the prompt's image list calls it.
  label: z.string().trim().min(1).max(60),
  // One line under the box.
  help: z.string().trim().max(200).optional(),
  required: z.boolean().default(false),
  // A text field (fields.copy key) drawn right under this box, e.g. "describe the prize".
  note: z.string().regex(/^[a-z][a-z0-9_]*$/).optional(),
  // false: code pastes this image onto the result and the model never sees it (a poster's QR
  // code, ARCHITECTURE §5.3). It is stored, kept and restored like any other slot.
  sendToModel: z.boolean().optional(),
})
export type ImageSlot = z.infer<typeof imageSlotSchema>

export const imageSlotsSchema = z.array(imageSlotSchema).min(1).max(IMAGE_SLOTS_MAX)

type SlotFields = { images: { min: number; max: number; slots?: readonly ImageSlot[] }; copy: readonly { key: string }[] }

export const slotsOf = (fields: { images: { slots?: readonly ImageSlot[] } }): readonly ImageSlot[] => fields.images.slots ?? []
export const hasSlots = (fields: { images: { slots?: readonly ImageSlot[] } }) => slotsOf(fields).length > 0
export const sentToModel = (slot: Pick<ImageSlot, 'sendToModel'>) => slot.sendToModel !== false

// The schema's refusals for a template's slots (English: the import scripts print them too).
// With slots, images.max is the number of slots and images.min the required ones, so the
// database's reference-count check (0943) counts them like any other user photo.
export function slotShapeProblems(fields: SlotFields): string[] {
  const slots = slotsOf(fields)
  if (slots.length === 0) return []
  const problems: string[] = []
  const keys = slots.map((slot) => slot.key)
  if (new Set(keys).size !== keys.length) problems.push('image slot keys must be unique')
  if (fields.images.max !== slots.length) problems.push('images.max must equal the number of image slots')
  if (fields.images.min !== slots.filter((slot) => slot.required).length) problems.push('images.min must equal the number of required image slots')
  const copyKeys = new Set(fields.copy.map((field) => field.key))
  const notes = slots.flatMap((slot) => (slot.note ? [slot.note] : []))
  if (notes.some((note) => !copyKeys.has(note))) problems.push('an image slot note must name one of the text fields')
  if (new Set(notes).size !== notes.length) problems.push('a text field can be the note of one image slot only')
  return problems
}

// A save's refusal (Chinese: the admin editor and the scripts show it): the partner API takes one
// image (§14.6), so a slot template is for the website only.
export function slotSurfaceProblems(fields: { images: { slots?: readonly ImageSlot[] } }, visibleIn: readonly string[]): string[] {
  return hasSlots(fields) && visibleIn.includes('partner') ? ['有图片格子的模板只能在站内用，请取消「伙伴（partner）」'] : []
}

// What a request sends: slot key → its upload. Only filled slots appear.
export type SlotUploads = Record<string, string>

// The filled slots in definition order, after the server's checks: no unknown slot, every
// required one filled, no upload used twice. Throws INVALID_INPUT like the other field checks.
export function checkSlotUploads(slots: readonly ImageSlot[], given: Readonly<Record<string, unknown>>): { slot: ImageSlot; key: string }[] {
  const unknown = Object.keys(given).find((key) => !slots.some((slot) => slot.key === key))
  if (unknown) throw new AppError('INVALID_INPUT', `Unknown image slot: ${unknown}`)
  const filled = slots.flatMap((slot) => {
    const key = given[slot.key]
    if (key === undefined || key === null || key === '') {
      if (slot.required) throw new AppError('INVALID_INPUT', `${slot.label} is required`)
      return []
    }
    if (typeof key !== 'string') throw new AppError('INVALID_INPUT', `${slot.label} must be an upload`)
    return [{ slot, key }]
  })
  if (new Set(filled.map((entry) => entry.key)).size !== filled.length) throw new AppError('INVALID_INPUT', 'The same upload is in two image slots')
  return filled
}

// Said after the list: Seedream once printed a slot's label ("Venue logo") on the poster, reading
// the list as copy to set (2026-11-14).
export const SLOT_LABELS_NOT_TEXT = 'These names only say which attached image is which; never write them on the image.'

// {{image_slots}}: which attached image is which, in the order they are sent, e.g.
// "Image 1 is the Venue logo; Image 2 is the 2nd prize photo. These names only say …". Labels go
// unquoted: a quoted phrase reads to image models like text to set. Empty slots take no number.
export function slotMapping(labels: readonly string[]): string {
  if (labels.length === 0) return 'No images are attached.'
  return `${labels.map((label, index) => `Image ${index + 1} is the ${label}`).join('; ')}. ${SLOT_LABELS_NOT_TEXT}`
}

// The kept copy of the n-th sent image is `…-in-<n>.<ext>` (T40); a copy that failed is left out
// of kept_inputs, so the number in the key, not the array index, says which slot it was.
export function keptSlotIndex(keptKey: string): number | null {
  const match = /-in-([1-9][0-9]?)\.[a-z0-9]+$/.exec(keptKey)
  return match ? Number(match[1]) - 1 : null
}

// A job's filled slots as stored: inputs.input_slots is an ordered array [{ key, upload }] in send
// order. An array, never an object: jsonb re-sorts object keys (shorter first), which would lose
// the order Make again maps kept copies back by. Anything malformed is none.
export type StoredSlot = { key: string; upload: string }

export const toStoredSlots = (slots: readonly { key: string; upload: string }[]): StoredSlot[] => slots.map(({ key, upload }) => ({ key, upload }))

export function storedSlotOrder(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry) => (typeof entry === 'object' && entry !== null && typeof entry.key === 'string' && typeof entry.upload === 'string' ? [entry.key] : []))
}

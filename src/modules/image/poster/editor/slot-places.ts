import type { PosterFields } from '@/core/poster'

// Where the editor draws each upload box (ARCHITECTURE §5.3). A slot every page of a set lists
// (the organiser logo) is one picture for the whole set, so it sits once in the shared tab's
// header, typed like the brand above it, not once per page. The QR code, which every page carries
// without listing it, keeps its own part in the shared tab. A page tab shows only the slots that
// page alone takes (the prize photo). What is sent is unchanged: each page sends what its kind
// lists plus the QR code (pageUploads), so a header slot goes with every page.
export type SlotPlace = 'header' | 'shared' | { kind: string }

// Listed by every kind of a set with more than one page; a one-page template has nothing shared.
function everyPageSlots(poster: PosterFields): string[] {
  if (poster.kinds.length < 2) return []
  const [first, ...rest] = poster.kinds
  return (first?.slots ?? []).filter((key) => rest.every((kind) => kind.slots.includes(key)) && key !== poster.qr?.slot)
}

export function slotKeysAt(poster: PosterFields, place: SlotPlace): string[] {
  if (place === 'header') return everyPageSlots(poster)
  if (place === 'shared') return poster.qr ? [poster.qr.slot] : []
  const shared = everyPageSlots(poster)
  return (poster.kinds.find((item) => item.key === place.kind)?.slots ?? []).filter((key) => !shared.includes(key))
}

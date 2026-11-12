// next/image fetches the srcset width for the slot the `sizes` attribute names times the device
// pixel ratio, so a 3× phone (most phones in mainland China) fetched 3× pictures: a public card
// half a 390 px row asked for the 640 w file. From mainland China, where the site moves a few KB/s,
// those bytes kept most of /zh's 130 pictures from loading at all (2026-11-12). On phones the
// public pages tell the browser two thirds of the real width instead: a 3× phone then fetches
// about 2× (384 w for that card, about half the bytes), a 2.6–2.75× phone about 1.8×, a 2× phone
// about 1.3×. Tablet and desktop values stay exact.
export function phoneSlot(viewportWidths: number): string {
  return `${Math.round((viewportWidths * 2) / 3)}vw`
}

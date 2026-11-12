// next/image fetches the srcset width for the slot the `sizes` attribute names times the device
// pixel ratio, so a 3× phone (most phones in mainland China) fetched 3× pictures: a public card
// half a 390 px row asked for the 640 w file. From mainland China, where the site moves a few KB/s,
// those bytes kept most of /zh's 130 pictures from loading at all (2026-11-12). On phones the
// public pages name 58% of the real width instead, so a 3× phone fetches about 2×: for a half-row
// card (50vw → 29vw) every phone up to 430 px wide lands on the 384 w file instead of 640 w, about
// half the bytes (two thirds was not enough: 33vw × 3 on a 390 px phone is 386 px, just over 384,
// and the browser took 640). A 2× phone then gets about 1.2×. Tablet and desktop stay exact.
const PHONE_PERCENT = 58

export function phoneSlot(viewportWidths: number): string {
  return `${Math.round((viewportWidths * PHONE_PERCENT) / 100)}vw`
}

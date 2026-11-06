// Third-party photo rules the landing pages quote (T44). Not our numbers, so not in
// site.config; each one is the platform's own published figure, read 2026-11-06. Sources and
// quotes: side-session-notes/landing-fact-sources-2026-11-06.md. Re-check before launch:
// platforms change these without notice.
export const PLATFORM_SPECS = {
  // Amazon Seller Forums (Amazon staff, Jan 2025 and ~Feb 2026): main image on pure white
  // RGB 255,255,255; 500–10,000 px on the longest side; over 1,000 px preferred for zoom.
  amazon: { minPx: 500, maxPx: 10_000, zoomPx: 1000 },
  // Etsy Help, "How to Add Photos to Your Listings": at least 2,000 px wide and tall. Since
  // 2026-10-22 one photo per listing must be an unedited photo of the actual item.
  etsy: { minPx: 2000 },
  // Shopify Help Center, "Product media types": 2048 × 2048 px usually displays best (square).
  shopify: { squarePx: 2048 },
  // DoorDash Merchant Help: landscape 16:9, at least 1400 × 800 px, the actual item served.
  doordash: { ratio: '16:9', minW: 1400, minH: 800 },
  // Uber Help, "Store submitted menu photo guidelines": 5:4 to 6:4, at least 550 × 440 px.
  uberEats: { ratio: '5:4–6:4', minW: 550, minH: 440 },
  // Grubhub for Restaurants Help Center: square, at least 200 × 200 px.
  grubhub: { minPx: 200 },
} as const

// "1,400" (English thousands); Chinese copy uses the same digits.
export const px = (n: number) => n.toLocaleString('en-US')

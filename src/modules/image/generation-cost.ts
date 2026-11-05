// Estimated provider cost per succeeded image, USD, by output resolution (T23 /admin/jobs).
// Same source as CREDITS_FLOOR next door: OpenAI list prices for high-quality square output
// (1K $0.053, 2K $0.107, 3K $0.178), before input image and prompt tokens. Medium-quality
// templates cost less, so this is an upper estimate. Update together with credits-floor.ts
// after the LAUNCH_CHECKLIST §5 measurement.
export const GENERATION_COST_USD: Readonly<Record<string, number>> = {
  '1k': 0.053,
  '2k': 0.107,
  '3k': 0.178,
}

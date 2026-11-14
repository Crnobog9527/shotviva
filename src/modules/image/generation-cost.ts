// Estimated provider cost per succeeded image, USD, by output resolution. Since T33 the admin
// shows real cost from provider usage; this constant only estimates jobs settled before T33,
// which have no usage (labelled 「估算」).
// Same source as CREDITS_FLOOR next door: OpenAI list prices for high-quality square output
// (1K $0.053, 2K $0.107, 4K $0.178), before input image and prompt tokens. Medium-quality
// templates cost less, so this is an upper estimate. Update together with credits-floor.ts
// after the LAUNCH_CHECKLIST §5 measurement.
export const GENERATION_COST_USD: Readonly<Record<string, number>> = {
  '1k': 0.053,
  '2k': 0.107,
  '4k': 0.178,
}

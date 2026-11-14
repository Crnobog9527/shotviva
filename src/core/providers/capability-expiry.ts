import type { ImageCapabilities } from '../templates/image-capabilities'

// Daily cron refreshes every provider. The editor repairs old/missing snapshots on demand
// and retries a temporary quote outage sooner, without treating a genuinely unpriced tier as stale.
// fixed: capabilities set in code (OpenAI, Ark), which never go stale.
export function nextCapabilitySync(fixed: boolean, caps?: ImageCapabilities | null): number {
  if (fixed) return Infinity
  if (!caps?.catalogPricing || caps.catalogVersion !== 1) return 0
  const ttl = caps.catalogPricing?.status === 'unavailable' ? 300_000 : 86_400_000
  return Date.parse(caps.fetchedAt) + ttl
}

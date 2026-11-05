import type { CreditsFloor } from '@/core/templates'

// Lowest credits a template may charge per quality × resolution (ARCHITECTURE §6.1):
// ceil(p95 real cost of one image at that tier's square ÷ $0.06), $0.06 being the most a credit
// may cost us at 60% gross margin on the cheapest credit sold. The admin save rejects anything
// lower; raising a price is always allowed.
//
// Initial values from OpenAI list prices (high square output 1K $0.053, 2K $0.107, 3K $0.178,
// plus input image, prompt, 10% failure refunds and storage). LAUNCH_CHECKLIST §5 measures real
// input-image tokens before launch; update this table from that measurement.
export const CREDITS_FLOOR: CreditsFloor = {
  high: { '1k': 2, '2k': 4, '3k': 6 },
  medium: { '1k': 1, '2k': 2, '3k': 3 },
}

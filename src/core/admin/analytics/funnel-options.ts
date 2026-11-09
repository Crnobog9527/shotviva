export const FUNNEL_STEPS = [
  { key: 'visit', event: '$pageview', where: '' },
  { key: 'upload', event: 'upload', where: '' },
  // An image the person actually got.
  { key: 'generate', event: 'generate', where: "AND properties.status = 'succeeded'" },
  { key: 'paywall', event: 'paywall_view', where: '' },
  { key: 'checkout', event: 'checkout_start', where: '' },
  { key: 'purchase', event: 'purchase', where: '' },
] as const
export type FunnelStepKey = (typeof FUNNEL_STEPS)[number]['key']

export const FUNNEL_DIMS = ['none', 'locale', 'device', 'source', 'country', 'visitor'] as const
export type FunnelDim = (typeof FUNNEL_DIMS)[number]

export function parseFunnelDim(value: unknown): FunnelDim {
  return typeof value === 'string' && (FUNNEL_DIMS as readonly string[]).includes(value) ? (value as FunnelDim) : 'none'
}

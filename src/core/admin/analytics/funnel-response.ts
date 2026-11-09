import 'server-only'

import { z } from 'zod'

import { breakdownsQuery, funnelQuery, type FunnelData, type FunnelGroup } from './funnel'
import { sqlEditorLink } from './links'
import { funnelEnd, readFunnelGroup } from './load'
import { RANGES, type Range } from './range'

export type FunnelResponse = {data: FunnelData; end: number; link: string}

export const funnelParams = z.object({
  range: z.enum(RANGES), group: z.enum(['breakdowns','visitor']),
  end: z.coerce.number().int().refine((end) => end === funnelEnd() || end === funnelEnd() - 600_000),
})

export async function funnelResponse(projectId: string, range: Range, group: FunnelGroup, end: number): Promise<FunnelResponse | null> {
  const block = await readFunnelGroup(range, group, end)
  if (block.status === 'error') return null
  const query = group === 'visitor' ? funnelQuery(block.window, 'visitor') : breakdownsQuery(block.window)
  return {data: block.data, end, link: sqlEditorLink(projectId, query)}
}

// What 水印追查 answers (trace.ts). Plain data: the page and its client form share it.
export type TraceMatch = {
  jobId: string
  userId: string
  ownerEmail: string | null
  creditPool: 'free' | 'paid'
  templateId: string
  status: string
  createdAt: string
  deleted: boolean
}

export type TraceResult =
  | { found: false }
  | {
      found: true
      // The 12 hex digits read from the picture, and how clearly: strength ≈ 1 is noise (the
      // decoder needs 1.3); agreement is the share of single cells that agree with the tile.
      prefix: string
      strength: number
      agreement: number
      // The picture's size against the copy as served (1 = unchanged).
      scale: { x: number; y: number }
      works: TraceMatch[]
    }

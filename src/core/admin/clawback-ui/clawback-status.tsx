import { Badge } from '@/core/ui/badge'

import { CLAWBACK_COPY as COPY } from './copy'

// What a payment's refunds and disputes took back (T71): 「已扣回 N」 and, when credits were already
// spent, 「欠扣 N 积分」 (written off, never recovered later).
export function ClawbackStatus({ clawedBack, shortfall }: { clawedBack: number; shortfall: number }) {
  if (clawedBack === 0 && shortfall === 0) return <span className="text-xs text-muted-foreground">{COPY.none}</span>
  return (
    <span className="flex flex-wrap items-center gap-1 text-xs whitespace-nowrap">
      {clawedBack > 0 ? <span className="font-mono">{COPY.clawedBack(clawedBack)}</span> : null}
      {shortfall > 0 ? (
        <Badge variant="destructive" title={COPY.shortfallHint}>
          {COPY.shortfall(shortfall)}
        </Badge>
      ) : null}
    </span>
  )
}

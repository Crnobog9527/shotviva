'use client'

import { useFormatter, useTranslations } from 'next-intl'

import { cn } from '../../ui/cn'
import type { VoteResult } from '../types'
import { useVote } from './use-vote'

type Props = { requestId: string; voted: boolean; count: number; enabled: boolean; onResult(result: VoteResult): void }

// "I want this too" and its count, bottom right of a card (DESIGN §4.7). Chosen state is the
// safelight rim; below the threshold it is greyed and does nothing (§15.1).
export function VoteButton({ requestId, voted, count, enabled, onResult }: Props) {
  const t = useTranslations('app.wishlist')
  const format = useFormatter()
  const vote = useVote(requestId, onResult)
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        aria-pressed={voted}
        disabled={!enabled || vote.pending}
        onClick={vote.toggle}
        aria-label={t('wantThisAria', { count })}
        className={cn(
          'press hairline inline-flex min-h-11 items-center gap-2 rounded-full bg-wash px-4 text-caption font-semibold',
          voted && 'text-primary shadow-[inset_0_0_0_1.5px_var(--primary)]',
          (!enabled || vote.pending) && 'text-muted-foreground',
        )}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill={voted ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round">
          <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z" />
        </svg>
        {t('wantThis')}
        <span className="font-mono">{format.number(count)}</span>
      </button>
      {vote.error && (
        <p role="alert" className="text-caption text-destructive">
          {t(`voteErrors.${vote.error}`)}
        </p>
      )}
    </div>
  )
}

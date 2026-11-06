'use client'

import { useFormatter, useTranslations } from 'next-intl'

import type { VoteResult } from '../types'
import { HeartIcon } from './icons'
import { useVote } from './use-vote'

type Props = { requestId: string; voted: boolean; count: number; enabled: boolean; onResult(result: VoteResult): void }

// "I want this too" (B comp wishlist.html .vote): a pill with the heart and the count, the words
// from 768 up; it fills with safelight when the vote is yours. Below the threshold it is greyed
// and does nothing (ARCHITECTURE §15.1).
export function VoteButton({ requestId, voted, count, enabled, onResult }: Props) {
  const t = useTranslations('app.wishlist')
  const format = useFormatter()
  const vote = useVote(requestId, onResult)
  return (
    <span className="grid justify-items-end gap-1">
      <button
        type="button"
        className="wl-vote"
        aria-pressed={voted}
        disabled={!enabled || vote.pending}
        onClick={vote.toggle}
        aria-label={t('wantThisAria', { count })}
      >
        <HeartIcon />
        <span className="wl-w">{t('wantThis')}</span>
        <span className="wl-c">{format.number(count)}</span>
      </button>
      {vote.error && (
        <span role="alert" className="text-caption text-destructive">
          {t(`voteErrors.${vote.error}`)}
        </span>
      )}
    </span>
  )
}

// A shipped request keeps its count, but voting is over (only live requests take votes).
export function VoteCount({ count }: { count: number }) {
  const t = useTranslations('app.wishlist')
  const format = useFormatter()
  return (
    <span className="wl-vote" data-static="" role="img" aria-label={t('votesAria', { count })}>
      <HeartIcon />
      <span className="wl-c">{format.number(count)}</span>
    </span>
  )
}

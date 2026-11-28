'use client'

import { useTranslations } from 'next-intl'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useMemo, useState } from 'react'

import { REPLAY_BLOCK_CLASS } from '@/core/analytics/replay'
import { buttonVariants } from '@/core/ui/button'

import { GroundedImg } from '../result/grounded-img'
import { albumSrc, savedNotes } from './album-save'
import type { BulkSavedAction } from './share-types'

type Props = { jobIds: readonly string[]; onClose(): void; saved?: BulkSavedAction }

// 「存到相册」 on a phone whose browser cannot hand files to the share sheet: the whole screen, the
// picked works full size one under another, and a hint that stays put while they scroll. A long
// press on each saves it to the gallery. Every picked work is here; they load as they come near.
export function AlbumView({ jobIds, onClose, saved }: Props) {
  const t = useTranslations('app.workShare.bulk')
  const note = useMemo(() => (saved ? savedNotes(saved) : () => undefined), [saved])
  return (
    <DialogPrimitive.Root open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content className="fixed inset-0 z-100 flex flex-col bg-background outline-none">
          <header className="bar-material flex flex-none items-start gap-3 px-(--gutter) pt-[calc(var(--sat)+12px)] pb-3">
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="text-body font-semibold">{t('albumTitle', { count: jobIds.length })}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-body leading-[1.45] text-primary">{t('albumHint')}</DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close className={buttonVariants({ variant: 'glass', size: 'touch', className: 'flex-none px-5' })}>{t('albumDone')}</DialogPrimitive.Close>
          </header>
          <ol className="grid min-h-0 flex-1 content-start gap-6 overflow-y-auto overscroll-contain px-(--gutter) pt-4 pb-[calc(var(--sab)+24px)]">
            {jobIds.map((id, index) => (
              <AlbumPhoto key={id} jobId={id} index={index} total={jobIds.length} onShown={note} />
            ))}
          </ol>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

// The first two load at once, the rest as they come near. One that did not load says so and
// loads again on a tap (the route is never cached).
function AlbumPhoto({ jobId, index, total, onShown }: { jobId: string; index: number; total: number; onShown(jobId: string): void }) {
  const t = useTranslations('app.workShare.bulk')
  const [failed, setFailed] = useState(false)
  const place = t('albumCount', { index: index + 1, total })
  return (
    <li className="grid gap-2">
      <p className="text-caption text-muted-foreground tabular-nums">{place}</p>
      {failed ? (
        <button type="button" onClick={() => setFailed(false)} className="min-h-40 rounded-tile bg-wash px-4 text-body text-muted-foreground">
          {t('albumRetry')}
        </button>
      ) : (
        <div className="min-h-24">
          <GroundedImg
            src={albumSrc(jobId)}
            alt={place}
            ground="white"
            loading={index < 2 ? 'eager' : 'lazy'}
            decoding="async"
            onLoad={() => onShown(jobId)}
            onError={() => setFailed(true)}
            className={`${REPLAY_BLOCK_CLASS} block h-auto w-full select-auto [-webkit-touch-callout:default]`}
          />
        </div>
      )}
    </li>
  )
}

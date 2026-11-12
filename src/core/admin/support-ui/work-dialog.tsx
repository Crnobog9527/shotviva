'use client'

import { Button } from '@/core/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/core/ui/dialog'

import type { WorkLinks } from '../support/view-work'
import { SUPPORT_COPY } from './copy'

const COPY = SUPPORT_COPY.view

function Figure({ label, url, missing }: { label: string; url: string | null; missing: string }) {
  return (
    <figure className="grid gap-2">
      <figcaption className="text-sm font-medium">{label}</figcaption>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer">
          {/* A 5-minute signed R2 URL: next/image would cache it past its life. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={label} className="max-h-[60vh] w-full rounded-md border border-border object-contain" />
        </a>
      ) : (
        <p className="text-sm text-muted-foreground">{missing}</p>
      )}
    </figure>
  )
}

// Both images side by side: the input as uploaded and the clean output, as signed links only.
export function WorkDialog({ links, onClose }: { links: WorkLinks; onClose: () => void }) {
  const inputMissing = links.inputExpired ? COPY.inputExpired : COPY.noInput
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{COPY.title}</DialogTitle>
          <DialogDescription>{COPY.body}</DialogDescription>
        </DialogHeader>
        {links.deleted ? (
          <p className="text-sm text-muted-foreground">{COPY.deleted}</p>
        ) : (
          <>
            {links.slotCount > 1 ? <p className="text-sm text-muted-foreground">{COPY.slots(links.slotCount)}</p> : null}
            <div className="grid gap-4 md:grid-cols-2">
              <Figure label={COPY.input} url={links.input} missing={inputMissing} />
              <Figure label={COPY.output} url={links.output} missing={COPY.noOutput} />
            </div>
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {COPY.close}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

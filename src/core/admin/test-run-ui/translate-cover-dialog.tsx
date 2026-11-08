'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Button } from '@/core/ui/button'
import { Checkbox } from '@/core/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/core/ui/dialog'
import type { Resolution } from '@/core/templates/output-options'

import type { AdminTemplate, CoverLanguage } from '../templates/types'
import { TEST_RUN_COPY as COPY } from './copy'
import { TranslateResult, type TranslateState } from './translate-result'
import { useTranslateRuns } from './use-translate-runs'

// Covers are shown at most 1600px; 2K keeps small type legible after translation.
const TRANSLATE_RESOLUTION: Resolution = '2k'

type Props = {
  template: AdminTemplate
  source: CoverLanguage
  sourceUrl: string
  languages: readonly CoverLanguage[]
  onClose: () => void
}

// 「生成其他语言版本」 (ARCHITECTURE §8.3, T87): tick target languages, one translation each (as
// admin test runs, so budget and cost apply), preview, re-run, then set one as that language's
// cover. Launched and upcoming languages alike; the source tab itself is not offered.
export function TranslateCoverDialog({ template, source, sourceUrl, languages, onClose }: Props) {
  const router = useRouter()
  const targets = languages.filter((language) => language.code !== null && language.code !== source.code)
  const [picked, setPicked] = useState<string[]>([])
  const runs = useTranslateRuns(template.id, source.code, TRANSLATE_RESOLUTION, () => router.refresh())
  const toggle = (code: string, on: boolean) => setPicked((current) => (on ? [...current, code] : current.filter((other) => other !== code)))
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{COPY.translate.title(source.label)}</DialogTitle>
          <DialogDescription>{COPY.translate.body}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={sourceUrl} alt="" className="bg-muted aspect-[4/5] w-full rounded-md border object-contain" />
          <div className="grid content-start gap-3">
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">{COPY.translate.targets}</legend>
              {targets.map((language) => (
                <label key={language.code} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={picked.includes(language.code!)} onCheckedChange={(checked) => toggle(language.code!, checked === true)} />
                  {language.label}
                  {language.upcoming ? <span className="text-muted-foreground text-xs">{COPY.translate.upcoming}</span> : null}
                </label>
              ))}
            </fieldset>
            <Button className="justify-self-start" disabled={picked.length === 0} onClick={() => runs.start(picked)}>
              {COPY.translate.run(picked.length)}
            </Button>
            {runs.error ? <p role="alert" className="text-destructive text-sm">{runs.error}</p> : null}
          </div>
        </div>
        <ul className="grid gap-3 sm:grid-cols-3">
          {Object.entries(runs.byTarget).map(([code, state]) => (
            <TranslateResult key={code} label={targets.find((language) => language.code === code)?.label ?? code}
              state={state as TranslateState} onRerun={() => runs.start([code])} onSetCover={() => runs.setAsCover(code)} />
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}

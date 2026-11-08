'use client'

import { useState } from 'react'

import { Button } from '@/core/ui/button'
import { Label } from '@/core/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/core/ui/dialog'

import type { CoverLanguage } from '../templates/types'
import type { TestRunView } from '../test-runs'
import { setCover } from './api'
import { TEST_RUN_COPY as COPY } from './copy'
import { failureMessage } from './messages'

type Props = {
  run: TestRunView | null
  // The cover tabs (T87): set the common cover or one language's own.
  languages: readonly CoverLanguage[]
  onClose: () => void
  onDone: () => void
  onError: (message: string) => void
}

// What this choice will change: a language's own "after", or the common cover (with the test
// photo as "before" when the run has one; a translation has none).
function describe(run: TestRunView | null, chosen: string, languages: readonly CoverLanguage[]): string {
  if (chosen) return COPY.cover.bodyLocale(languages.find((language) => language.code === chosen)?.label ?? chosen)
  return run?.photoId ? COPY.cover.body : COPY.cover.bodyAfterOnly
}

// 设为封面 (ARCHITECTURE §10.b): it changes what visitors see, so it asks first.
// Remounted per run, so a choice left from a cancelled dialog never carries over.
export function CoverDialog(props: Props) {
  return <CoverDialogBody key={props.run?.id ?? 'none'} {...props} />
}

function CoverDialogBody({ run, languages, onClose, onDone, onError }: Props) {
  const [saving, setSaving] = useState(false)
  // A translation defaults to the language it was translated into; anything else to 通用. undefined
  // = not touched yet, so an explicit 通用 ('') is never replaced by that default.
  const [locale, setLocale] = useState<string | undefined>(undefined)
  const chosen = locale ?? run?.targetLocale ?? ''
  const confirm = async () => {
    if (!run) return
    setSaving(true)
    try {
      await setCover(run.id, chosen || null)
      onDone()
    } catch (error) {
      onError(failureMessage(error))
    } finally {
      setSaving(false)
      setLocale(undefined)
      onClose()
    }
  }
  return (
    <Dialog open={run !== null} onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{COPY.cover.title}</DialogTitle>
          <DialogDescription>{describe(run, chosen, languages)}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="test-cover-locale">{COPY.coverTarget}</Label>
          <select id="test-cover-locale" className="border-input h-9 rounded-md border bg-transparent px-3 text-sm" value={chosen} onChange={(event) => setLocale(event.target.value)}>
            {languages.map((language) => (
              <option key={language.code ?? 'common'} value={language.code ?? ''}>
                {language.label}
                {language.upcoming ? COPY.translate.upcoming : ''}
              </option>
            ))}
          </select>
        </div>
        {run?.outputUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={run.outputUrl} alt="" className="bg-muted mx-auto max-h-64 rounded-md border object-contain" />
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {COPY.cover.cancel}
          </Button>
          <Button onClick={confirm} disabled={saving}>
            {saving ? COPY.cover.saving : COPY.cover.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

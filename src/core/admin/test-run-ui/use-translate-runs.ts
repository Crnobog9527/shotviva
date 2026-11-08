'use client'

import { useState } from 'react'

import type { Resolution } from '@/core/templates/output-options'

import { setCover, startTranslate } from './api'
import { failureMessage } from './messages'
import { announceRunsChanged } from './runs-changed'
import type { TranslateState } from './translate-result'

// The translation runs of one 「生成其他语言版本」 dialog, by target language: each runs as its own
// request (all at once), a re-run replaces that language's result, and a finished one can be set
// as that language's cover (T87).
export function useTranslateRuns(templateId: string, sourceLocale: string | null, resolution: Resolution, onCoverSet: () => void) {
  const [byTarget, setByTarget] = useState<Record<string, TranslateState>>({})
  const [error, setError] = useState<string | null>(null)
  const put = (code: string, state: TranslateState) => setByTarget((current) => ({ ...current, [code]: state }))

  const start = (codes: readonly string[]) => {
    setError(null)
    const batchId = crypto.randomUUID()
    for (const code of codes) {
      put(code, { status: 'running' })
      startTranslate({ runId: crypto.randomUUID(), batchId, templateId, sourceLocale, targetLocale: code, resolution })
        .then((run) => put(code, { status: 'done', run, coverSet: false }))
        .then(announceRunsChanged)
        .catch((failure: unknown) => {
          setByTarget((current) => Object.fromEntries(Object.entries(current).filter(([other]) => other !== code)))
          setError(failureMessage(failure))
        })
    }
  }

  const setAsCover = async (code: string) => {
    const state = byTarget[code]
    if (state?.status !== 'done') return
    put(code, { ...state, saving: true })
    try {
      await setCover(state.run.id, code)
      put(code, { ...state, coverSet: true, saving: false })
      announceRunsChanged()
      onCoverSet()
    } catch (failure) {
      put(code, { ...state, saving: false })
      setError(failureMessage(failure))
    }
  }

  return { byTarget, error, start, setAsCover }
}

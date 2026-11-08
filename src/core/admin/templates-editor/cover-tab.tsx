'use client'

import { useState } from 'react'


import { acceptFor } from '../covers/cover-rules'
import type { AdminTemplate, CoverLanguage, TemplateAdminActions } from '../templates/types'
import { TranslateCoverDialog } from '../test-run-ui'

import { coverCopy as COPY } from './copy'
import { coverSetOf } from './cover-set'
import { CoverTabActions } from './cover-tab-actions'
import { CoverSlot } from './cover-slot'
import { useCoverUpload } from './use-cover-upload'

type Props = {
  template: AdminTemplate
  language: CoverLanguage
  languages: readonly CoverLanguage[]
  actions: Pick<TemplateAdminActions, 'requestCoverUpload' | 'applyCover'>
}

const still = (url: string | null) => (url ? { url, video: false } : null)

function Note({ language }: { language: CoverLanguage }) {
  const text = language.code === null ? COPY.commonNote : language.upcoming ? COPY.upcomingNote(language.label) : COPY.languageNote(language.label)
  return <p className="text-muted-foreground text-xs">{text}</p>
}

// One tab of the cover area (T87): the three slots of that tab's cover, its motion controls, a
// language tab's 「删除」, and 「生成其他语言版本」 from its "after".
export function CoverTab({ template, language, languages, actions }: Props) {
  const { pending, busy, message, upload, clearMotion, clearLocale } = useCoverUpload(template.id, actions, language.code)
  const [translating, setTranslating] = useState(false)
  const set = coverSetOf(template, language.code)
  const motion = set.mediaType !== 'image' && set.video ? { url: set.video, video: set.mediaType === 'video', poster: set.poster } : null
  const id = `cover-${language.code ?? 'common'}`
  return (
    <div className="grid gap-3">
      <Note language={language} />
      {/* Three cards on wide screens, two below ~1100px, one below ~700px. */}
      <div className="grid grid-cols-1 gap-4 min-[700px]:grid-cols-2 min-[1100px]:grid-cols-3">
        <CoverSlot id={`${id}-before`} label={COPY.before} accept={acceptFor('before')} hint={COPY.stillHint}
          preview={still(set.before)} busy={busy === 'before'} disabled={pending} onFile={(file) => upload('before', file)} />
        <CoverSlot id={`${id}-after`} label={COPY.after} accept={acceptFor('after')} hint={COPY.stillHint}
          preview={still(set.after)} busy={busy === 'after'} disabled={pending} onFile={(file) => upload('after', file)} />
        <CoverSlot id={`${id}-motion`} label={COPY.motion} accept={acceptFor('motion')} hint={COPY.motionHint}
          preview={motion} busy={busy === 'motion'} disabled={pending} onFile={(file) => upload('motion', file)} />
      </div>
      <CoverTabActions set={set} language={language} pending={pending} onBackToStill={clearMotion} onTranslate={() => setTranslating(true)} onClear={clearLocale} />
      {message ? (
        <p role={message.ok ? 'status' : 'alert'} className={message.ok ? 'text-sm text-emerald-700' : 'text-destructive text-sm'}>
          {message.text}
        </p>
      ) : null}
      {translating && set.after ? (
        <TranslateCoverDialog template={template} source={language} sourceUrl={set.after} languages={languages} onClose={() => setTranslating(false)} />
      ) : null}
    </div>
  )
}

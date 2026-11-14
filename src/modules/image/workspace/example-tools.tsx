'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@/core/ui/button'

// An action that would wipe text the user typed asks first (总控 2026-11-14: a misclick must not
// undo their work): with nothing typed it acts at once, else it turns into a one-line question
// with 确定 / 取消 in place, no dialog over the dialog.
export function ConfirmAction({ label, question, risky, onConfirm, variant = 'ghost' }: {
  label: string; question: string; risky: boolean; onConfirm(): void; variant?: 'ghost' | 'outline'
}) {
  const t = useTranslations('app.workspace.examples')
  const [asking, setAsking] = useState(false)
  if (asking) {
    return (
      <span role="group" aria-label={question} className="flex flex-wrap items-center gap-2">
        <span className="text-caption">{question}</span>
        <Button variant="outline" size="sm" className="min-h-11" onClick={() => { setAsking(false); onConfirm() }}>{t('confirm')}</Button>
        <Button variant="ghost" size="sm" className="min-h-11" onClick={() => setAsking(false)}>{t('cancel')}</Button>
      </span>
    )
  }
  return <Button variant={variant} size="sm" className="min-h-11" onClick={() => (risky ? setAsking(true) : onConfirm())}>{label}</Button>
}

// Over a form that opened with the cover's text: a line saying so, 全部清空 and 恢复示例.
export function ExampleTools({ hint, typed, onClearAll, onRestore }: { hint: string; typed: boolean; onClearAll(): void; onRestore(): void }) {
  const t = useTranslations('app.workspace.examples')
  return (
    <div className="grid gap-2 rounded-control bg-wash-faint p-3 text-caption">
      <p className="text-muted-foreground">{hint}</p>
      <div className="flex flex-wrap items-center gap-2">
        <ConfirmAction variant="outline" label={t('clearAll')} question={t('clearAllQuestion')} risky={typed} onConfirm={onClearAll} />
        <ConfirmAction label={t('restore')} question={t('restoreQuestion')} risky={typed} onConfirm={onRestore} />
      </div>
    </div>
  )
}

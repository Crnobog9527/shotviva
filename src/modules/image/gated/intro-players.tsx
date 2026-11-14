'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'

import { cn } from '@/core/ui/cn'

import { BatchScene } from './batch-demo'
import { Stage } from './demo-parts'
import { batchCounts, MATRIX_TEMPLATES } from './feature-access'
import { BATCH_STARTS, matrixRows, matrixStarts, TEMPLATE_KEYS } from './intro-media'
import { MatrixScene } from './matrix-demo'
import { usePlayback } from './use-playback'

const BATCH_STEPS = ['step1', 'step2', 'step3', 'step4'] as const

// The batch intro's demo with its four steps beside it: the step the demo is on is lit, so the
// words and the picture tell the same story. "Play again" remounts it from the start.
export function BatchPlayer() {
  const [run, setRun] = useState(0)
  return <BatchRun key={run} onReplay={() => setRun((n) => n + 1)} />
}

function BatchRun({ onReplay }: { onReplay(): void }) {
  const t = useTranslations('app.gated.batch')
  const { phase, reduce } = usePlayback(BATCH_STARTS)
  const counts = batchCounts()
  return (
    <>
      <Stage label={t('demo.label', { count: counts.max })} caption={t('demo.caption', { count: counts.max })} onReplay={onReplay} reduce={reduce}>
        <BatchScene phase={phase} reduce={reduce} />
      </Stage>
      <ol className="mt-4 grid gap-2.5">
        {BATCH_STEPS.map((step, index) => (
          <Step key={step} lit={!reduce && phase === index + 1}>
            {t(step, counts)}
          </Step>
        ))}
      </ol>
    </>
  )
}

function Step({ lit, children }: { lit: boolean; children: string }) {
  return (
    <li className={cn('flex gap-2.5 text-body leading-[1.45] transition-colors duration-300 motion-reduce:transition-none', lit ? 'text-foreground' : 'text-bone-dim')}>
      <span aria-hidden="true" className={cn('mt-[0.55em] size-1.5 flex-none rounded-full transition-colors duration-300', lit ? 'bg-primary' : 'bg-[var(--input)]')} />
      <span>{children}</span>
    </li>
  )
}

type Scene = 'one' | 'grid'

// Several templates, two ways (Owner 2026-11-12): one photo through several templates, then
// photos × templates. It plays the first, moves on to the second once, and stops; choosing a
// way plays that one alone. "Play again" starts from the first.
export function TemplatesPlayer() {
  const t = useTranslations('app.gated.templates')
  const [state, setState] = useState<{ scene: Scene; run: number; auto: boolean }>({ scene: 'one', run: 0, auto: true })
  const play = (scene: Scene, auto: boolean) => setState((s) => ({ scene, auto, run: s.run + 1 }))
  return (
    <>
      <div role="group" aria-label={t('scenes')} className="mt-4 grid grid-cols-2 gap-1 rounded-full bg-wash p-1">
        {(['one', 'grid'] as const).map((scene) => (
          <button
            key={scene}
            type="button"
            aria-pressed={state.scene === scene}
            onClick={() => play(scene, false)}
            className={cn('press min-h-10 rounded-full px-2 text-caption leading-[1.2] font-semibold', state.scene === scene ? 'bg-foreground text-background' : 'text-bone-dim')}
          >
            {t(`tabs.${scene}`)}
          </button>
        ))}
      </div>
      <SceneRun key={`${state.scene}-${state.run}`} scene={state.scene} onEnd={state.auto && state.scene === 'one' ? () => play('grid', false) : undefined} onReplay={() => play('one', true)} />
    </>
  )
}

function SceneRun({ scene, onEnd, onReplay }: { scene: Scene; onEnd?: () => void; onReplay(): void }) {
  const t = useTranslations('app.gated.templates')
  const rows = matrixRows(useLocale())
  const shown = scene === 'one' ? 1 : rows.length
  const cells = shown * TEMPLATE_KEYS.length
  const { phase, reduce } = usePlayback(matrixStarts(cells), onEnd, 2200)
  const values = { templates: MATRIX_TEMPLATES, max: batchCounts().max, count: cells }
  return (
    <Stage label={t(`demo.label.${scene}`, values)} caption={t(`demo.caption.${scene}`, values)} onReplay={onReplay} reduce={reduce}>
      <MatrixScene rows={rows} shown={shown} phase={phase} />
    </Stage>
  )
}

'use client'

import { useState } from 'react'

import { Button } from '@/core/ui/button'
import { Label } from '@/core/ui/label'
import { Textarea } from '@/core/ui/textarea'
import { INSTRUCTION_MAX_LENGTH } from '@/core/templates/edit-params'

import type { TestRunView } from '../test-runs'
import { TEST_RUN_COPY as COPY } from './copy'
import { editLaunches } from './launches'
import { RunOptions, type RunOptionValues } from './run-options'
import type { Launch } from './use-test-panel'

type Props = { targets: readonly TestRunView[]; onLaunch: (launches: Launch[]) => void; onClose: () => void }

// 编辑 (ARCHITECTURE §10.b): one sentence on one result (once or three times) or on up to three
// selected results (once each), with the edit panel's size and tier, default "as the source".
export function EditComposer({ targets, onLaunch, onClose }: Props) {
  const [instruction, setInstruction] = useState('')
  const [options, setOptions] = useState<RunOptionValues>({ resolution: '', aspect: '', triple: false })
  const trimmed = instruction.trim()
  const count = targets.length > 1 ? targets.length : options.triple ? 3 : 1
  const submit = () => {
    onLaunch(editLaunches(targets, trimmed, options))
    onClose()
  }
  return (
    <section aria-labelledby="test-edit-title" className="border-primary/40 bg-primary/5 grid gap-3 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <h3 id="test-edit-title" className="text-sm font-semibold">
          {COPY.edit.title(targets.length)}
        </h3>
        <ul className="ml-auto flex gap-1.5" aria-label={COPY.edit.targets}>
          {targets.map((target) => (
            <li key={target.id} className="bg-muted size-10 overflow-hidden rounded border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {target.outputUrl ? <img src={target.outputUrl} alt="" className="h-full w-full object-cover" /> : null}
            </li>
          ))}
        </ul>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="test-edit-instruction">{COPY.edit.instruction}</Label>
        <Textarea
          id="test-edit-instruction"
          rows={2}
          maxLength={INSTRUCTION_MAX_LENGTH}
          placeholder={COPY.edit.placeholder}
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          autoFocus
        />
        <p className="text-muted-foreground text-xs">{COPY.edit.hint}</p>
      </div>
      <RunOptions
        id="test-edit"
        values={options}
        onChange={(patch) => setOptions((current) => ({ ...current, ...patch }))}
        sameLabel={COPY.edit.aspectSame}
        tripleAvailable={targets.length === 1}
      />
      <div className="flex gap-2">
        <Button onClick={submit} disabled={trimmed.length === 0}>
          {COPY.edit.run(count)}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {COPY.edit.close}
        </Button>
      </div>
    </section>
  )
}

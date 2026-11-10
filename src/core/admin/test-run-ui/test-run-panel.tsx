'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import type { ImageProviderOption } from '@/core/admin/image-provider-field'

import type { AdminTemplate, CoverLanguage } from '../templates/types'
import type { TestRunView } from '../test-runs'
import { AssetManager } from './asset-manager'
import { BudgetBar } from './budget-bar'
import { CompareDialog } from './compare-dialog'
import { TEST_RUN_COPY as COPY } from './copy'
import { CoverDialog } from './cover-dialog'
import { EditComposer } from './edit-composer'
import { FirstRunForm } from './first-run-form'
import { Records } from './records'
import { useRunSelection } from './use-run-selection'
import { useTestPanel } from './use-test-panel'

function Status({ error, notice }: { error: string | null; notice: string | null }) {
  if (error) return <p role="alert" className="text-destructive text-sm">{error}</p>
  return notice ? <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p> : null
}

const savedProvider = (template: AdminTemplate) => template.prompt?.providerId ?? 'default'

// 试跑面板 (ARCHITECTURE §10.b, T85), beside the template form: today's budget, 首次出图, the edit
// composer when a result is being edited, then the record tree. Everything runs on the saved
// template through /api/admin/test-*; a new cover refreshes the page so the form shows it.
// languages: the cover tabs (T87), so 「设为封面」 can pick which one.
export function TestRunPanel({ template, languages, providers }: { providers: readonly ImageProviderOption[]; template: AdminTemplate; languages: readonly CoverLanguage[] }) {
  const router = useRouter()
  const panel = useTestPanel(template.id)
  const selection = useRunSelection(panel.runs)
  const [editing, setEditing] = useState<readonly TestRunView[] | null>(null)
  const [comparing, setComparing] = useState<readonly [TestRunView, TestRunView] | null>(null)
  const [covering, setCovering] = useState<TestRunView | null>(null)
  const coverDone = () => {
    panel.setNotice(COPY.cover.done)
    void panel.reload()
    router.refresh()
  }
  return (
    <section aria-labelledby="test-run-title" className="grid min-w-0 content-start gap-4">
      <header className="grid gap-1">
        <h2 id="test-run-title" className="text-base font-semibold">
          {COPY.title}
        </h2>
        <p className="text-muted-foreground text-xs">{COPY.intro}</p>
        <p className="text-muted-foreground text-xs">{COPY.savedOnly(template.prompt?.version ?? null)}</p>
      </header>
      <BudgetBar budget={panel.data?.budget ?? null} onSaved={() => void panel.reload()} onError={panel.setError} />
      <Status error={panel.error} notice={panel.notice} />
      <FirstRunForm key={savedProvider(template)} providers={providers} template={template} photos={panel.data?.recentPhotos ?? []} onLaunch={(launches) => void panel.launch(launches)} onPhotoUploaded={() => void panel.reload()} onError={panel.setError} />
      <AssetManager kind="run" template={template.id} onRemoved={() => { selection.clear(); setEditing(null); void panel.reload() }} onError={panel.setError} onNotice={panel.setNotice} />
      {editing ? <EditComposer key={editing.map((run) => run.id).join()} targets={editing} onLaunch={(launches) => void panel.launch(launches)} onClose={() => setEditing(null)} /> : null}
      <Records
        runs={panel.runs}
        languages={languages}
        actions={{ selected: selection.selected, onSelect: selection.onSelect, onEdit: (run) => setEditing([run]), onCover: setCovering }}
        onCompare={() => selection.picked.length === 2 && setComparing([selection.picked[0]!, selection.picked[1]!])}
        onEditSelected={() => setEditing(selection.picked.slice(0, 3))}
        onClear={selection.clear}
      />
      <CompareDialog pair={comparing} photoUrls={panel.data?.photoUrls ?? {}} onClose={() => setComparing(null)} />
      <CoverDialog run={covering} languages={languages} onClose={() => setCovering(null)} onDone={coverDone} onError={panel.setError} />
    </section>
  )
}

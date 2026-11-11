'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { limitsFor } from '@/core/billing/tier-limits'
import { useRouter } from '@/core/i18n'
import { Link } from '@/core/i18n/ui'
import { navTypesFor } from '@/core/ui/nav-motion'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { isCompareSample, TemplateSample } from '../catalogue/template-sample'
import { FavoriteButton } from '../favorites/favorite-button'
import { CreateSheet } from './create-sheet'
import { FormAction } from './form-action'
import { useWorkspaceDraft, type DraftInput } from './use-workspace-draft'
import { WorkspaceForm } from './workspace-form'

export type CreateContext = Omit<DraftInput, 'template'>

type Props = CreateContext & { template: CatalogueTemplate | null; onClose(): void }

// Tapping a template opens this straight away (DESIGN §6.9 item 2: no "use this template?"
// step): the template's sample on one side and the creation form on the other, the same form
// the workspace page renders. Generate queues the photo and goes to that template's workspace
// page, which shows it developing; the jobs run in the app-wide generation store, so the move
// does not interrupt them.
export function CreateDialog({ template, onClose, ...context }: Props) {
  // The last template stays mounted while the dialog closes, so its closing motion can play.
  const [shown, setShown] = useState(template)
  if (template && template !== shown) setShown(template)
  // A new template starts a new draft: the body remounts per template.
  return shown ? <CreateBody key={shown.id} template={shown} open={template !== null} onClose={onClose} {...context} /> : null
}

type BodyProps = CreateContext & { template: CatalogueTemplate; open: boolean; onClose(): void }

function CreateBody({ template, open, onClose, ...context }: BodyProps) {
  const t = useTranslations('app.template')
  const router = useRouter()
  const draft = useWorkspaceDraft({ template, ...context, single: true })
  const workspace = `/generate/${template.id}`
  // Generate moves to the template's workspace page. Its shell is fetched while the visitor is
  // still picking a photo, so the move, and the developing view the shell draws from this tab's
  // own job (workspace-pending.tsx), happen on the click instead of after a round trip. The
  // router drops a prefetched route after a few minutes (measured on the test site: a click 5.5
  // minutes in waited 1.1–3.6 s again), so it is fetched again whenever the router says its copy
  // went stale, for as long as the dialog is open.
  useEffect(() => {
    if (!open) return
    let closed = false
    const warm = () => {
      if (!closed) router.prefetch(workspace, { onInvalidate: warm })
    }
    warm()
    return () => {
      closed = true
    }
  }, [open, router, workspace])
  const batch = limitsFor(context.tier).batchMax > 1 && draft.photos.photos.length === 0
  const tall = isCompareSample(template)
  const generate = () => {
    void draft.start()
    onClose()
    router.push(workspace, { transitionTypes: navTypesFor(workspace) })
  }
  return (
    <CreateSheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={template.name}
      description={[template.categoryName, template.description].filter(Boolean).join(' · ')}
      hint={t(tall ? 'hintCompare' : 'hintPair')}
      tall={tall}
      folded={draft.photos.photos.length > 0}
      sample={
        <div className="relative max-md:h-full">
          <TemplateSample template={template} className="max-md:h-full max-md:aspect-auto" />
          {/* The save heart (T83) takes the right corner the Phone / AI tags leave free. */}
          <FavoriteButton template={template} surface="create_dialog" className={tall ? 'right-1 bottom-1' : 'top-1 right-1'} />
        </div>
      }
      form={
        <WorkspaceForm
          template={template}
          balance={context.balance}
          tier={context.tier}
          photos={draft.photos}
          values={draft.values}
          onChange={draft.change}
          surface="create_dialog"
          photoExtra={batch ? <BatchLink templateId={template.id} onGo={onClose} /> : null}
        />
      }
      bar={<FormAction state={draft.state} resolution={draft.values.resolution} batch={draft.photos.batchMax > 1} onGenerate={generate} placement="sheet" limit={context.concurrency.limit} />}
    />
  )
}

// Pro and Max can pick several photos, but on the workspace page's tray, not here.
export function BatchLink({ templateId, onGo }: { templateId: string; onGo(): void }) {
  const t = useTranslations('app.workspace.batch')
  return (
    <Link href={`/generate/${templateId}`} onClick={onGo} className="press mt-2 inline-flex min-h-11 items-center gap-0.5 text-caption font-medium text-foreground hover:underline hover:underline-offset-3">
      {t('onPage')}
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 text-primary" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 6l6 6-6 6" />
      </svg>
    </Link>
  )
}

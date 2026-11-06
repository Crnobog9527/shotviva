import { useTranslations } from 'next-intl'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { sizeLabel, tierName } from '../workspace/workspace-options'
import type { AgainStart } from './again-start'
import { ShortDay } from './short-day'

// Top of the Make again form (T6 workspace.html?again): what was carried over, and from when.
// "Making again: Pure White · Post 4:5 · Standard · note kept, from 28 Oct."
export function AgainNote({ again, template }: { again: AgainStart; template: CatalogueTemplate }) {
  const t = useTranslations('app')
  const { values } = again
  const parts = [template.name, sizeLabel(values.aspect, t), tierName(values.resolution, t)]
  if (values.note.trim()) parts.push(t('workspace.again.noteKept'))
  return (
    <p className="hairline mt-4 rounded-inner bg-wash px-3 py-2.5 text-caption leading-[1.4] text-muted-foreground">
      {t.rich('workspace.again.note', {
        b: (chunks) => <b className="font-medium text-foreground">{chunks}</b>,
        summary: parts.join(' · '),
        day: () => <ShortDay iso={again.madeAt} />,
      })}
    </p>
  )
}

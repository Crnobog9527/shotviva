import { useTranslations } from 'next-intl'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { chosenAspect, closestResolution, templateOptions } from '../workspace/output-choice'
import { sizeLabel, tierName } from '../workspace/workspace-options'
import type { AgainStart } from './again-start'
import { ShortDay } from './short-day'

// Top of the Make again form (T6 workspace.html?again): what was carried over, and from when.
// "Making again: Pure White · Post 4:5 · Standard · note kept, from 28 Oct."
export function AgainNote({ again, template, photoRatio }: { again: AgainStart; template: CatalogueTemplate; photoRatio?: number }) {
  const t = useTranslations('app')
  const { values } = again
  const options = templateOptions(template)
  const aspect = chosenAspect(values.aspect, options, photoRatio)
  const resolution = closestResolution(values.resolution, options)
  const adjusted = aspect !== values.aspect || resolution !== values.resolution
  const parts = [template.name]
  if (aspect) parts.push(sizeLabel(aspect, t))
  if (resolution) parts.push(tierName(resolution, t))
  if (values.note.trim()) parts.push(t('workspace.again.noteKept'))
  if (again.from === 'gallery') {
    return (
      <p className="hairline mt-4 rounded-inner bg-wash px-3 py-2.5 text-caption leading-[1.4] text-muted-foreground">
        {t.rich('workspace.again.reuseNote', { b: (chunks) => <b className="font-medium text-foreground">{chunks}</b>, summary: parts.join(' · ') })}
        {adjusted ? <span className="block">{t('workspace.again.optionsChanged')}</span> : null}
      </p>
    )
  }
  return (
    <p className="hairline mt-4 rounded-inner bg-wash px-3 py-2.5 text-caption leading-[1.4] text-muted-foreground">
      {t.rich('workspace.again.note', {
        b: (chunks) => <b className="font-medium text-foreground">{chunks}</b>,
        summary: parts.join(' · '),
        day: () => <ShortDay iso={again.madeAt} />,
      })}
      {adjusted ? <span className="block">{t('workspace.again.optionsChanged')}</span> : null}
    </p>
  )
}

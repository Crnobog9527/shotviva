import { useTranslations } from 'next-intl'

import { PickButtons } from '../workspace/photo-pickers'

// Make again without the photo (T6 workspace.html?again=expired): a work made before originals
// were kept with it, a settle copy that failed, or a copy back that failed just now. Everything
// else is prefilled; the user adds the same photo and generates as usual.
export function MissingPhoto({ reason, multiple, onPick }: { reason: 'old' | 'failed'; multiple: boolean; onPick(files: File[]): void }) {
  const t = useTranslations('app.workspace.again')
  return (
    <div className="hairline-lit grid grid-cols-[56px_1fr] items-center gap-x-3 gap-y-1 rounded-panel bg-card px-4 py-3.5">
      <span
        aria-hidden="true"
        className="row-span-2 aspect-[4/5] w-14 rounded-inner bg-[repeating-linear-gradient(135deg,var(--hatch)_0_4px,transparent_4px_8px)] shadow-[inset_0_0_0_1px_var(--recess-edge)]"
      />
      <b className="text-body leading-[1.3] font-semibold">{t('missingTitle')}</b>
      <span className="text-caption leading-[1.4] text-muted-foreground">{t(reason === 'old' ? 'missingOld' : 'missingFailed')}</span>
      <PickButtons onPick={onPick} multiple={multiple} className="col-span-2 mt-2" />
    </div>
  )
}

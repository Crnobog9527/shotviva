import { useFormatter, useTranslations } from 'next-intl'

import { Textarea } from '../../ui/textarea'
import { DESCRIPTION_MAX } from '../rules'

// "The look" (B comp wishlist.html .field): 16px text, a mono counter below. The word "prompt"
// never appears; the placeholder shows what a good request reads like.
export function DescriptionField({ value, onChange }: { value: string; onChange(value: string): void }) {
  const t = useTranslations('app.wishlist.new')
  const format = useFormatter()
  return (
    <div className="grid gap-2">
      <label htmlFor="request-description" className="text-label font-semibold">
        {t('describe')}
      </label>
      <Textarea
        id="request-description"
        value={value}
        maxLength={DESCRIPTION_MAX}
        rows={5}
        placeholder={t('placeholder')}
        enterKeyHint="done"
        autoCapitalize="sentences"
        aria-describedby="request-description-count"
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[140px] rounded-control text-body"
      />
      <p id="request-description-count" className="justify-self-end font-mono text-caption text-muted-foreground">
        {t('counter', { count: format.number(value.length), max: format.number(DESCRIPTION_MAX) })}
      </p>
    </div>
  )
}

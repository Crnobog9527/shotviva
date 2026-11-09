import { useTranslations } from 'next-intl'

import { Button } from '../../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '../../ui/dialog'

type Props = { old: string | null; code: string; cancel(): void; replace(): void; restoreFocus(): void }

export function ReplaceDialog({ old, code, cancel, replace, restoreFocus }: Props) {
  const t = useTranslations('app.accountCodes.redeem')
  return (
    <Dialog open onOpenChange={open => { if (!open) cancel() }}>
      <DialogContent className="z-[120]" showCloseButton={false} onCloseAutoFocus={event => { event.preventDefault(); restoreFocus() }}>
        <DialogTitle>{t('confirmTitle')}</DialogTitle>
        <DialogDescription>{t('confirmBody', { old: old ?? t('current'), code })}</DialogDescription>
        <DialogFooter>
          <Button size="touch" variant="glass" onClick={cancel}>{t('keep')}</Button>
          <Button size="touch" onClick={replace}>{t('replace')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

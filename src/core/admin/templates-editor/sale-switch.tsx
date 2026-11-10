'use client'

import { Label } from '@/core/ui/label'
import { Switch } from '@/core/ui/switch'
import type { AdminTemplate, TemplateAdminActions } from '../templates/types'
import { saleCopy as copy } from './copy'
import { useTemplateActions } from './use-template-actions'

export function SaleSwitch({ template, action, disabled }: {
  template: Pick<AdminTemplate, 'id' | 'saleEnabled' | 'isActive'> | null; action: TemplateAdminActions['setSale']; disabled: boolean
}) {
  const { run, pending, error, notice } = useTemplateActions()
  if (!template) return null
  return <div className="grid gap-1">
    <Label><Switch checked={!!template.saleEnabled} disabled={disabled || pending || template.isActive}
      onCheckedChange={enabled => run(() => action({ id: template.id, enabled }), enabled ? copy.opened : copy.closed)} />
      {copy.label}</Label>
    <p className="text-muted-foreground text-xs">{template.isActive ? copy.active : copy.first}</p>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
  </div>
}

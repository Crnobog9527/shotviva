import { useState } from 'react'

import { Button } from '@/core/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/core/ui/dialog'
import { Label } from '@/core/ui/label'

import type { AdminRequest } from '../types'
import { COPY } from './copy'
import type { TemplateOption } from './types'

type Props = {
  request: AdminRequest | null
  templates: readonly TemplateOption[]
  pending: boolean
  onCancel: () => void
  onConfirm: (request: AdminRequest, templateId: string) => void
}

// Marks a live request shipped and links the template its card will jump to.
export function ShipDialog({ request, templates, pending, onCancel, onConfirm }: Props) {
  const [templateId, setTemplateId] = useState('')
  const close = () => {
    setTemplateId('')
    onCancel()
  }
  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{COPY.ship.title}</DialogTitle>
          <DialogDescription>{request?.description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="ship-template">{COPY.ship.template}</Label>
          <select
            id="ship-template"
            className="border-input h-9 rounded-md border bg-transparent px-3 text-sm"
            value={templateId}
            onChange={(event) => setTemplateId(event.target.value)}
          >
            <option value="">{COPY.ship.choose}</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {`${template.name} (${template.id})`}
              </option>
            ))}
          </select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={pending}>
            {COPY.ship.cancel}
          </Button>
          <Button disabled={pending || !templateId} onClick={() => request && onConfirm(request, templateId)}>
            {COPY.ship.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

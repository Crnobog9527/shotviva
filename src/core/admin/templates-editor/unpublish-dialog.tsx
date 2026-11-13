'use client'

import { useState } from 'react'

import { Button } from '@/core/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/core/ui/dialog'
import { Label } from '@/core/ui/label'
import { Textarea } from '@/core/ui/textarea'

import type { AdminTemplate } from '../templates/types'

type Props = {
  template: AdminTemplate | null
  pending: boolean
  onCancel: () => void
  onConfirm: (reason: string) => void
}

// Unpublishing hides a live template from users, so it needs confirmation and a reason (DESIGN §7).
export function UnpublishDialog({ template, pending, onCancel, onConfirm }: Props) {
  const [reason, setReason] = useState('')
  const close = () => {
    setReason('')
    onCancel()
  }
  return (
    <Dialog open={template !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>下架「{template?.name}」？</DialogTitle>
          <DialogDescription>
            下架后用户和伙伴入口都看不到这个模板，可以随时重新上架。
            {template?.seriesId ? '它会同时移出所在的系列，重新上架后要在系列管理里重新加入。' : null}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="unpublish-reason">下架原因（必填）</Label>
          <Textarea
            id="unpublish-reason"
            value={reason}
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={pending}>
            取消
          </Button>
          <Button
            variant="destructive"
            disabled={pending || reason.trim().length === 0}
            onClick={() => {
              onConfirm(reason.trim())
              setReason('')
            }}
          >
            确认下架
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

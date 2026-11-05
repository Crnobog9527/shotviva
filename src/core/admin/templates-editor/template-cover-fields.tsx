'use client'

import { Button } from '@/core/ui/button'

import { acceptFor } from '../covers/cover-rules'
import type { AdminTemplate, TemplateAdminActions } from '../templates/types'

import { CoverSlot } from './cover-slot'
import { useCoverUpload } from './use-cover-upload'

type Props = {
  // The latest saved row, so a finished upload shows its new file straight away.
  template: AdminTemplate
  actions: Pick<TemplateAdminActions, 'requestCoverUpload' | 'applyCover'>
}

const still = (url: string | null) => (url ? { url, video: false } : null)

// Cover media (ARCHITECTURE §8.3): before / after stills for static cards and the preview
// drawer, plus an optional motion cover (animated WebP from GIF / WebP, or MP4 + first frame).
export function TemplateCoverFields({ template, actions }: Props) {
  const { pending, busy, message, upload, clearMotion } = useCoverUpload(template.id, actions)
  const motion = template.coverMediaType !== 'image' && template.coverVideoUrl
    ? { url: template.coverVideoUrl, video: template.coverMediaType === 'video' }
    : null
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 text-sm font-semibold">封面（上传后立即生效，不随「保存」）</legend>
      <div className="grid grid-cols-3 gap-3">
        <CoverSlot id="cover-before" label="前图（手机原图）" accept={acceptFor('before')} hint="JPEG / PNG / WebP，≤20MB"
          preview={still(template.coverBeforeUrl)} busy={busy === 'before'} disabled={pending}
          onFile={(file) => upload('before', file)} />
        <CoverSlot id="cover-after" label="后图（AI 成品）" accept={acceptFor('after')} hint="JPEG / PNG / WebP，≤20MB"
          preview={still(template.coverAfterUrl)} busy={busy === 'after'} disabled={pending}
          onFile={(file) => upload('after', file)} />
        <CoverSlot id="cover-motion" label="动态封面（可选）" accept={acceptFor('motion')}
          hint="GIF / 动态 WebP ≤20MB，或 MP4 ≤15MB ≤15 秒" preview={motion} busy={busy === 'motion'}
          disabled={pending} onFile={(file) => upload('motion', file)} />
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted-foreground">当前卡片类型：{template.coverMediaType}</span>
        {template.coverMediaType !== 'image' ? (
          <Button variant="outline" size="sm" disabled={pending} onClick={clearMotion}>
            改回静态图卡片
          </Button>
        ) : null}
      </div>
      {message ? (
        <p role={message.ok ? 'status' : 'alert'} className={message.ok ? 'text-sm text-emerald-700' : 'text-destructive text-sm'}>
          {message.text}
        </p>
      ) : null}
    </fieldset>
  )
}

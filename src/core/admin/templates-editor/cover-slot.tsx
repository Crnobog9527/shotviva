'use client'

import { Label } from '@/core/ui/label'

type Props = {
  id: string
  label: string
  accept: string
  hint: string
  // Current public file; a video plays muted in a loop, anything else shows as an image.
  preview: { url: string; video: boolean } | null
  busy: boolean
  disabled: boolean
  onFile: (file: File) => void
}

export function CoverSlot({ id, label, accept, hint, preview, busy, disabled, onFile }: Props) {
  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="bg-muted flex aspect-square items-center justify-center overflow-hidden rounded-md">
        {preview?.video ? (
          <video src={preview.url} className="h-full w-full object-cover" muted loop autoPlay playsInline />
        ) : preview ? (
          // Admin-only preview of an already-converted public file; next/image adds nothing here.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview.url} alt={label} className="h-full w-full object-cover" />
        ) : (
          <span className="text-muted-foreground text-xs">未上传</span>
        )}
      </div>
      <input
        id={id}
        type="file"
        accept={accept}
        disabled={disabled}
        className="text-xs"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) onFile(file)
        }}
      />
      <p className="text-muted-foreground text-xs">{busy ? '处理中…' : hint}</p>
    </div>
  )
}

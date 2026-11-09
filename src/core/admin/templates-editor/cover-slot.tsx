'use client'

import type { CSSProperties } from 'react'

import { buttonVariants } from '@/core/ui/button'
import { cn } from '@/core/ui/cn'

import { coverCopy as COPY } from './copy'
import { coverFileName, formatBytes, useFileSize } from './cover-file'

type Props = {
  id: string
  label: string
  accept: string
  hint: string
  // Current public file. A video shows with its poster and plays on demand; an animated WebP
  // plays by itself like any image.
  preview: { url: string; video: boolean; poster?: string | null; inherited?: boolean } | null
  download?: { href: string; label: string }
  busy: boolean
  disabled: boolean
  onFile: (file: File) => void
}

// A neutral checkerboard so transparent PNGs and pale stills read against the box.
const CHECKER: CSSProperties = {
  backgroundImage: 'repeating-conic-gradient(rgb(127 127 127 / 0.14) 0% 25%, transparent 0% 50%)',
  backgroundSize: '16px 16px',
}

function Preview({ label, preview }: Pick<Props, 'label' | 'preview'>) {
  return (
    <div className="bg-muted relative flex aspect-[4/5] items-center justify-center overflow-hidden rounded-md border" style={CHECKER}>
      {preview?.video ? (
        <video src={preview.url} poster={preview.poster ?? undefined} className="h-full w-full object-contain" controls muted loop playsInline preload="metadata" />
      ) : preview ? (
        // Admin-only preview of an already-converted public file; next/image adds nothing here.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview.url} alt={label} className="h-full w-full object-contain" />
      ) : (
        <span className="text-muted-foreground text-xs">未上传</span>
      )}
    </div>
  )
}

function FileLine({ url }: { url: string }) {
  const size = useFileSize(url)
  const name = coverFileName(url)
  return (
    <p className="text-muted-foreground min-w-0 truncate font-mono text-xs" title={name}>
      {name}
      {size === null ? '' : ` · ${formatBytes(size)}`}
    </p>
  )
}

// One cover card (ARCHITECTURE §8.3): title, the stored file at a fixed 4:5 (contained, never
// cropped), a styled picker (Replace once a file exists), its name and size, and the limits.
export function CoverSlot({ id, label, accept, hint, preview, download, busy, disabled, onFile }: Props) {
  return (
    <section aria-labelledby={`${id}-title`} className="bg-card grid min-w-0 content-start gap-2.5 rounded-lg border p-3">
      <h3 id={`${id}-title`} className="text-sm font-medium">
        {label}
      </h3>
      <Preview label={label} preview={preview} />
      <div className="flex min-w-0 items-center gap-2">
        <input
          id={id}
          type="file"
          accept={accept}
          disabled={disabled}
          className="peer sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) onFile(file)
          }}
        />
        <label
          htmlFor={id}
          aria-disabled={disabled}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'peer-focus-visible:ring-ring shrink-0 cursor-pointer peer-focus-visible:ring-2', disabled && 'pointer-events-none opacity-50')}
        >
          {busy ? '处理中…' : preview && !preview.inherited ? '替换' : '上传'}
        </label>
        {preview ? <FileLine url={preview.url} /> : null}
      </div>
      {preview?.inherited && <p className="text-muted-foreground text-xs">{COPY.fallback}</p>}
      {download && <a href={download.href} download className={buttonVariants({ variant: 'outline', size: 'sm', className: 'justify-self-start' })}>{download.label}</a>}
      <p className="text-muted-foreground text-xs break-words">{hint}</p>
    </section>
  )
}

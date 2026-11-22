'use client'

import { useEffect, useRef, useState } from 'react'

// One org work's small picture through the admin thumb route; a work whose file is gone (or a
// storage error) shows the same placeholder as a work without a picture instead of a broken image.
export function OrgWorkThumbImage({ jobId, fallback }: { jobId: string; fallback: string }) {
  const [failed, setFailed] = useState(false)
  const ref = useRef<HTMLImageElement>(null)
  // A load that failed before hydration fired its error event before onError was attached.
  useEffect(() => {
    const img = ref.current
    if (img?.complete && img.naturalWidth === 0) setFailed(true)
  }, [])
  if (failed) return <OrgWorkThumbPlaceholder label={fallback} />
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a 5-minute signed R2 redirect, not optimisable
    <img
      ref={ref}
      src={`/api/admin/org-works/${jobId}/thumb`}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className="size-14 rounded-md bg-muted object-cover"
    />
  )
}

export function OrgWorkThumbPlaceholder({ label }: { label: string }) {
  return <div className="flex size-14 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">{label}</div>
}

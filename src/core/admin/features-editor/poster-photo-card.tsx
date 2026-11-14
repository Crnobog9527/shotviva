'use client'

import { useState } from 'react'

import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'

import { useAdminAction } from '../shell/use-admin-action'
import type { ActionResult } from '../templates/types'

// 拍照识别's price per run (1521, ARCHITECTURE §5.3「每周复用」): one number. Empty means the
// feature is off on this site; each site (test, production) saves its own.
const COPY = {
  title: '拍照识别旧海报 · 每次扣的积分',
  body: '赛事海报编辑器里「拍照识别旧海报」每按一次扣多少积分（不论选一张还是两张）。读不出字或失败自动退回。没设置时，编辑器不显示这个按钮。',
  unset: '还没设置：这个站点不提供拍照识别。',
  save: '保存',
  saved: '已保存，编辑器下次打开就按这个价。',
  invalid: '要填 1～1000 的整数。',
}

export function PosterPhotoCard({ credits, save }: { credits: number | null; save: (input: { credits: number }) => Promise<ActionResult> }) {
  const [value, setValue] = useState(credits === null ? '' : String(credits))
  const { pending, error, notice, run } = useAdminAction()
  const valid = /^[1-9]\d{0,3}$/.test(value) && Number(value) <= 1000
  const submit = () => run(async () => {
    const result = await save({ credits: Number(value) })
    return result.ok ? { ok: true as const, value: undefined } : result
  }, () => COPY.saved)
  return (
    <section className="grid gap-3 rounded-lg border border-border bg-card p-4" aria-labelledby="poster-photo-title">
      <h2 id="poster-photo-title" className="font-medium">{COPY.title} <span className="font-mono text-xs font-normal text-muted-foreground">poster_photo_credits</span></h2>
      <p className="text-sm text-muted-foreground">{COPY.body}</p>
      {credits === null ? <p className="text-sm font-medium">{COPY.unset}</p> : null}
      <form className="flex flex-wrap items-center gap-3" onSubmit={(event) => { event.preventDefault(); if (valid) submit() }}>
        <Input className="w-32" inputMode="numeric" value={value} onChange={(event) => setValue(event.target.value.trim())} aria-invalid={value !== '' && !valid} aria-label={COPY.title} />
        <Button type="submit" disabled={pending || !valid || Number(value) === credits}>{COPY.save}</Button>
        <Status message={value !== '' && !valid ? COPY.invalid : error} notice={notice} />
      </form>
    </section>
  )
}

function Status({ message, notice }: { message: string | null | undefined; notice: string | null | undefined }) {
  if (message) return <p className="text-sm text-destructive">{message}</p>
  return notice ? <p className="text-sm text-muted-foreground" role="status">{notice}</p> : null
}

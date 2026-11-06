'use client'

import { Button } from '@/core/ui/button'

import type { AdminTemplate } from '../templates/types'
import { moveId } from './form-state'
import { FEATURED_LIMIT } from './featured-state'

type Props = { ids: string[]; templates: AdminTemplate[]; pending: boolean; onChange: (ids: string[]) => void }

// 首页精选 (T53): the home page's featured templates in display order; the switch in the table
// adds or removes one, this list orders them. With none chosen, the home page shows the six
// most recently published.
export function FeaturedPanel({ ids, templates, pending, onChange }: Props) {
  const byId = new Map(templates.map((template) => [template.id, template]))
  return (
    <section aria-labelledby="featured-h" className="rounded-md border p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="featured-h" className="font-medium">
          首页精选
        </h2>
        <span className="text-muted-foreground text-sm">
          {ids.length} / {FEATURED_LIMIT}
        </span>
      </div>
      <p className="text-muted-foreground mt-1 text-sm">
        首页和落地页的模板区按分类显示这里的模板，顺序即同一分类内的先后，第一个也是首页生成栏默认选中的模板。只能选已上架、站内可见的模板。一个都不选时显示最新上架的 6 个。
      </p>
      {ids.length === 0 ? (
        <p className="text-muted-foreground mt-3 text-sm">还没有精选模板，在下表「首页精选」一列打开。</p>
      ) : (
        <ol className="mt-3 grid gap-1">
          {ids.map((id, index) => (
            <li key={id} className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground w-6 font-mono">{index + 1}</span>
              <span className="flex-1">
                {byId.get(id)?.name ?? id} <span className="text-muted-foreground font-mono text-xs">{id}</span>
              </span>
              <Button variant="ghost" size="sm" aria-label={`上移 ${id}`} disabled={pending || index === 0} onClick={() => onChange(moveId(ids, index, -1) ?? ids)}>
                ↑
              </Button>
              <Button variant="ghost" size="sm" aria-label={`下移 ${id}`} disabled={pending || index === ids.length - 1} onClick={() => onChange(moveId(ids, index, 1) ?? ids)}>
                ↓
              </Button>
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => onChange(ids.filter((other) => other !== id))}>
                移出
              </Button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

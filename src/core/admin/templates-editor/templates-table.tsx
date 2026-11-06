'use client'

import { Badge } from '@/core/ui/badge'
import { Button } from '@/core/ui/button'
import { Switch } from '@/core/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/core/ui/table'

import type { AdminTemplate } from '../templates/types'
import { canFeature } from './featured-state'

const SURFACE_LABEL = { web: '站内', partner: '伙伴' } as const

type Props = {
  templates: AdminTemplate[]
  // Reordering is only meaningful on the full, unfiltered list.
  canReorder: boolean
  pending: boolean
  onEdit: (template: AdminTemplate) => void
  onToggle: (template: AdminTemplate, active: boolean) => void
  onMove: (index: number, direction: -1 | 1) => void
  // 首页精选 (T53): whether the list is full, and the switch handler.
  featuredFull: boolean
  onFeature: (template: AdminTemplate, on: boolean) => void
}

export function TemplatesTable({ templates, canReorder, pending, onEdit, onToggle, onMove, featuredFull, onFeature }: Props) {
  if (templates.length === 0) {
    return <p className="text-muted-foreground py-8 text-center text-sm">没有匹配的模板</p>
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>排序</TableHead>
          <TableHead>名称 / ID</TableHead>
          <TableHead>分类</TableHead>
          <TableHead>展示入口</TableHead>
          <TableHead>积分（Standard / HD / Max）</TableHead>
          <TableHead>提示词版本</TableHead>
          <TableHead>上架</TableHead>
          <TableHead>首页精选</TableHead>
          <TableHead className="text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {templates.map((template, index) => (
          <TableRow key={template.id}>
            <TableCell>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`上移 ${template.name}`}
                  disabled={!canReorder || pending || index === 0}
                  onClick={() => onMove(index, -1)}
                >
                  ↑
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`下移 ${template.name}`}
                  disabled={!canReorder || pending || index === templates.length - 1}
                  onClick={() => onMove(index, 1)}
                >
                  ↓
                </Button>
              </div>
            </TableCell>
            <TableCell>
              <div className="font-medium">{template.name}</div>
              <div className="text-muted-foreground font-mono text-xs">{template.id}</div>
            </TableCell>
            <TableCell>{template.category}</TableCell>
            <TableCell>
              <div className="flex gap-1">
                {template.visibleIn.map((surface) => (
                  <Badge key={surface} variant="secondary">
                    {SURFACE_LABEL[surface]}
                  </Badge>
                ))}
              </div>
            </TableCell>
            <TableCell>
              {`${template.creditsCost['1k']} / ${template.creditsCost['2k']} / ${template.creditsCost['3k']}`}
              <span className="text-muted-foreground block text-xs">{template.quality}</span>
            </TableCell>
            <TableCell>{template.prompt ? `v${template.prompt.version}` : '缺失'}</TableCell>
            <TableCell>
              <Switch
                checked={template.isActive}
                disabled={pending}
                aria-label={`${template.isActive ? '下架' : '上架'} ${template.name}`}
                onCheckedChange={(checked) => onToggle(template, checked)}
              />
            </TableCell>
            <TableCell>
              <FeaturedSwitch template={template} full={featuredFull} pending={pending} onFeature={onFeature} />
            </TableCell>
            <TableCell className="text-right">
              <Button variant="outline" size="sm" disabled={pending} onClick={() => onEdit(template)}>
                编辑
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

// Off and disabled while the template is unpublished or partner-only, or the list is full.
function FeaturedSwitch({ template, full, pending, onFeature }: { template: AdminTemplate; full: boolean; pending: boolean; onFeature: Props['onFeature'] }) {
  const on = template.featuredRank !== null
  const blocked = !on && (!canFeature(template) || full)
  return (
    <Switch
      checked={on}
      disabled={pending || blocked}
      title={blocked ? (canFeature(template) ? '最多 12 个' : '只有已上架、站内可见的模板能上首页') : undefined}
      aria-label={`${on ? '移出' : '加入'}首页精选 ${template.name}`}
      onCheckedChange={(checked) => onFeature(template, checked)}
    />
  )
}

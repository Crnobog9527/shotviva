'use client'

import type { ApprovedTariff, CreditsFloor, Resolution, TemplateQuality } from '@/core/templates'
import { OPENAI_MAX_REFERENCES, type ImageCapabilities } from '@/core/templates/image-capabilities'
import { FULL_IMAGE_OPTIONS } from '@/core/templates/image-options'
import { Label } from '@/core/ui/label'

import { ModelSyncStatus } from './model-sync'
import { copy } from './copy'

export type ImageProviderOption = {
  id: string; label: string; model: string; isActive: boolean; openAI: boolean
  capabilities: ImageCapabilities | null; floor: CreditsFloor
  fallbackFloors?: Record<TemplateQuality, Record<Resolution, number | null>>
  tariffs?: Record<string, ApprovedTariff>
  version?: 'v1' | 'v2'; approved?: Record<string, ApprovedTariff>
}

type Props = {
  id: string
  providers: readonly ImageProviderOption[]
  value: string | null
  onChange: (id: string | null) => void
}

export function ImageProviderField({ id, providers, value, onChange }: Props) {
  const selected = value ? providers.find(p => p.id === value) : providers.find(p => p.isActive)
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{copy.label}</Label>
      <select id={id} className="border-input h-9 min-w-0 rounded-md border bg-transparent px-3 text-sm"
        aria-describedby={`${id}-hint`} value={value ?? ''} onChange={(event) => onChange(event.target.value || null)}>
        <option value="">{copy.followDefault}</option>
        {providers.filter(p => p.id !== 'env').map((provider) => (
          <option key={provider.id} value={provider.id}>{provider.label} · {provider.model}</option>
        ))}
      </select>
      <p id={`${id}-hint`} className="text-muted-foreground text-xs">{selected ? capabilitySummary(selected) : copy.unknown}</p>
      {selected && <ModelSyncStatus key={selected.id + selected.model + (selected.capabilities?.fetchedAt ?? '')} provider={selected} />}
    </div>
  )
}

function capabilitySummary(provider: ImageProviderOption) {
  if (!provider.capabilities && !provider.openAI) return copy.unknown
  const caps = provider.capabilities ?? { ...FULL_IMAGE_OPTIONS, minReferences: 0, maxReferences: OPENAI_MAX_REFERENCES, fetchedAt: null, providerAspectRatios: undefined }
  const ratios = caps.providerAspectRatios ?? caps.aspectRatios
  const time = caps.fetchedAt ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'short' }).format(new Date(caps.fetchedAt)) : '固定能力'
  return [provider.model, caps.resolutions.map(r => r.toUpperCase()).join(' / '),
    ...(provider.openAI ? [] : [copy.routerQuality]),
    `比例 ${ratios.length} 种（${ratios.join('、')}）`, caps.originalRatio ? '支持原图比例' : '不支持原图比例',
    `参考图 ${caps.minReferences}–${caps.maxReferences} 张`, `上次刷新：${time}`].join(' · ')
}

import type { Resolution } from '@/core/templates/output-options'
import { useState } from 'react'
import type { LabModels, LabVersion } from '../prompt-lab/types'
import type { TestBudget, TestPhotoView } from '../test-runs'
import { MatrixSubmit } from './matrix-submit'
import { Photos } from './photos'
import { copy as c, usd } from './copy'

type Props = { sessionId: string; models: LabModels['image']; versions: LabVersion[]; recent: TestPhotoView[]
  budget: TestBudget; archived: boolean; changed(): Promise<void> }
export function Matrix({ sessionId, models, versions, recent, budget, archived, changed }: Props) {
  const [running, setRunning] = useState(false)
  const [providerId, setProvider] = useState(models[0]?.id ?? '')
  const [resolution, setRes] = useState(models[0]?.resolutions[0] ?? '1k')
  const [quality, setQuality] = useState('medium')
  const [style, setStyle] = useState(false)
  const [photoIds, setPhotos] = useState<string[]>([])
  const [versionIds, setVersions] = useState<string[]>([])
  const model = models.find(m => m.id === providerId)
  const count = photoIds.length * versionIds.length
  const input = { sessionId, photoIds, versionIds, providerId, resolution, quality, useStyleReference: style }
  return <section className="grid gap-3 rounded border p-4"><h2 className="font-medium">{c.matrix}</h2>
    <fieldset disabled={archived || running} className="grid gap-3"><Photos photos={recent} selected={photoIds} onSelect={setPhotos} />
    <fieldset><legend>{c.pickedVersions}</legend><div className="flex flex-wrap gap-3">
      {versions.map(v => <label key={v.id}><input type="checkbox" checked={versionIds.includes(v.id)}
        onChange={e => setVersions(e.target.checked ? [...versionIds, v.id] : versionIds.filter(id => id !== v.id))} /> v{v.version_no}</label>)}
    </div></fieldset>
    <ModelFields models={models} providerId={providerId} resolution={resolution} quality={quality}
      onModel={(id, res) => { setProvider(id); setRes(res); setQuality('medium') }}
      onResolution={setRes} onQuality={setQuality} />
    <label><input type="checkbox" checked={style} onChange={e => setStyle(e.target.checked)} /> {c.style}</label>
    <p>{c.budget} {usd(budget.spentUsd)} / {usd(budget.budgetUsd)} · {count} {c.count}</p>
    <small>{c.limit}</small>{!model && <p>{c.noModel}</p>}
    </fieldset>
    <MatrixSubmit key={JSON.stringify(input)} input={input} disabled={!model || count < 1 || count > 12 || archived} changed={changed} onBusy={setRunning} />
    </section>
}

type Fields = Pick<Props, 'models'> & { providerId: string; resolution: Resolution; quality: string
  onModel(id: string, resolution: Resolution): void; onResolution(value: Resolution): void; onQuality(value: string): void }
function ModelFields({ models, providerId, resolution, quality, onModel, onResolution, onQuality }: Fields) {
  const model = models.find(m => m.id === providerId)
  return (<div className="flex flex-wrap gap-3">
      <label>{c.model}<select value={providerId} className="block rounded border p-1" onChange={e => {
        const option = models.find(m => m.id === e.target.value)
        onModel(e.target.value, option?.resolutions[0] ?? '1k')
      }}>{models.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
      <label>{c.resolution}<select value={resolution} className="block rounded border p-1"
        onChange={e => onResolution(e.target.value as Resolution)}>{model?.resolutions.map(r => <option key={r}>{r}</option>)}</select></label>
      <label>{c.quality}<select value={quality} disabled={model?.fixedQuality} className="block rounded border p-1"
        onChange={e => onQuality(e.target.value)}><option value="medium">{model?.fixedQuality ? c.fixed : c.medium}</option>
        {!model?.fixedQuality && <option value="high">{c.high}</option>}</select></label>
    </div>)
}

'use client'

import { useState } from 'react'

import { UPLOAD_ACCEPT } from '@/core/storage/rules'

import { useUpload, type UploadState } from '../use-upload'
import { useTestGeneration, type TestGeneration } from './use-test-generation'

// TEMPORARY, deliberately unstyled (T4). Lets Codex drive upload → generate → download on
// a phone before the real workspace (T8) exists. Delete with T8.

export type TestTemplate = { id: string; name: string; aspectRatios: string[]; copyKeys: string[] }

function generationText(generation: TestGeneration): string | null {
  if (generation.phase === 'generating') return 'Generating… usually about 60 seconds. You can leave this page.'
  if (generation.phase === 'failed') {
    return `Failed: ${generation.code} ${generation.message}${generation.refunded ? ' (image refunded)' : ''}`
  }
  return generation.phase === 'succeeded' ? 'Done' : null
}

function uploadText(upload: UploadState): string {
  if (upload.phase === 'compressing') return 'Compressing…'
  if (upload.phase === 'uploading') return `Uploading… ${Math.round(upload.progress * 100)}%`
  if (upload.phase === 'error') return `Upload failed: ${upload.code} ${upload.message}`
  return 'Pick a photo'
}

function Options({ values, value, onChange }: { values: { id: string; label: string }[]; value: string; onChange(v: string): void }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {values.map((item) => (
        <option key={item.id} value={item.id}>{item.label}</option>
      ))}
    </select>
  )
}

function Result({ fileUrl }: { fileUrl: string }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- auth-gated route, not a static asset */}
      <img src={fileUrl} alt="Result" style={{ width: '100%' }} />
      <a href={`${fileUrl}?download=1`}>Download</a>
    </>
  )
}

const RESOLUTION_OPTIONS = [
  { id: '1k', label: 'Standard' },
  { id: '2k', label: 'HD' },
  { id: '3k', label: 'Max' },
]

const NO_TEMPLATE: TestTemplate = { id: '', name: '', aspectRatios: ['1:1'], copyKeys: [] }

function CopyInputs({ keys, copy, onChange }: { keys: string[]; copy: Record<string, string>; onChange(next: Record<string, string>): void }) {
  return keys.map((key) => (
    <input key={key} placeholder={key} value={copy[key] ?? ''} onChange={(event) => onChange({ ...copy, [key]: event.target.value })} />
  ))
}

export function UploadTestPanel({ templates }: { templates: TestTemplate[] }) {
  const { state: upload, upload: send } = useUpload()
  const { state: generation, generate } = useTestGeneration()
  const [file, setFile] = useState<File | null>(null)
  const [templateId, setTemplateId] = useState((templates[0] ?? NO_TEMPLATE).id)
  const [inputKey, setInputKey] = useState<string | null>(null)
  const template = templates.find((item) => item.id === templateId) ?? NO_TEMPLATE
  const [aspect, setAspect] = useState(template.aspectRatios[0] as string)
  const [copy, setCopy] = useState<Record<string, string>>({})
  const [resolution, setResolution] = useState('1k')

  async function run(retry: boolean) {
    const key = retry ? inputKey : file && (await send(file))
    if (!key) return
    setInputKey(key)
    await generate({ template_id: templateId, input_key: key, inputs: { copy, aspect_ratio: aspect, resolution } })
  }

  const fileUrl = generation.phase === 'succeeded' ? generation.job.file_url : null
  return (
    <div style={{ padding: 16, display: 'grid', gap: 12, maxWidth: 480 }}>
      <p>T4 upload test harness (temporary, not the real workspace)</p>
      <input type="file" accept={UPLOAD_ACCEPT} onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      <Options values={templates.map((t) => ({ id: t.id, label: t.name }))} value={templateId} onChange={setTemplateId} />
      <Options values={template.aspectRatios.map((r) => ({ id: r, label: r }))} value={aspect} onChange={setAspect} />
      <Options values={RESOLUTION_OPTIONS} value={resolution} onChange={setResolution} />
      <CopyInputs keys={template.copyKeys} copy={copy} onChange={setCopy} />
      <button type="button" disabled={!file || !templateId} onClick={() => run(false)}>Generate</button>
      <button type="button" disabled={!inputKey} onClick={() => run(true)}>Retry with same photo</button>
      <p data-testid="status">{generationText(generation) ?? uploadText(upload)}</p>
      {fileUrl ? <Result fileUrl={fileUrl} /> : null}
    </div>
  )
}

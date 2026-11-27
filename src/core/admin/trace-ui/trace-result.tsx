import type { TraceResult } from '../trace/types'
import { TRACE_COPY as copy } from './copy'

// What the reader found: the id prefix and how clearly, then every work with that prefix.
export function TraceResultView({ result }: { result: TraceResult }) {
  if (!result.found) return <p className="text-sm text-muted-foreground">{copy.notFound}</p>
  return (
    <section className="grid gap-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{copy.found}</dt>
        <dd className="font-mono">{result.prefix}</dd>
        <dt className="text-muted-foreground">{copy.strength}</dt>
        <dd>{result.strength.toFixed(2)}</dd>
        <dt className="text-muted-foreground">{copy.agreement}</dt>
        <dd>{Math.round(result.agreement * 100)}%</dd>
        <dt className="text-muted-foreground">{copy.scale}</dt>
        <dd>{result.scale.x.toFixed(3)} × {result.scale.y.toFixed(3)}</dd>
      </dl>
      {result.works.length === 0 ? <p className="text-sm">{copy.noWork}</p> : <WorksTable works={result.works} />}
    </section>
  )
}

function WorksTable({ works }: { works: Extract<TraceResult, { found: true }>['works'] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-muted-foreground">
          <tr>
            {Object.values(copy.columns).map((label) => (
              <th key={label} className="py-1 pr-4 font-normal">{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {works.map((work) => (
            <tr key={work.jobId} className="border-t align-top">
              <td className="py-2 pr-4 font-mono text-xs">{work.jobId}</td>
              <td className="py-2 pr-4">
                <a className="underline" href={`/admin/users?q=${encodeURIComponent(work.ownerEmail ?? work.userId)}`}>{work.ownerEmail ?? work.userId}</a>
              </td>
              <td className="py-2 pr-4">{copy.pool[work.creditPool]}</td>
              <td className="py-2 pr-4">{work.templateId}</td>
              <td className="py-2 pr-4">{new Date(work.createdAt).toLocaleString('zh-CN')}</td>
              <td className="py-2 pr-4">{work.deleted ? copy.deleted : work.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

import { orderHelpCopy as copy } from './order-help-copy'

// What decides the order on 创作页·全部 and where each part is set (Owner 2026-11-13), shown on both
// 系列管理 and the template list, so the two drag lists read as one ruler.
export function OrderHelp() {
  return (
    <details className="bg-muted/40 rounded-md border p-3 text-sm">
      <summary className="cursor-pointer font-medium">{copy.title}</summary>
      <ol className="mt-2 grid list-decimal gap-1.5 pl-5">
        {copy.points.map(point => <li key={point}>{point}</li>)}
      </ol>
    </details>
  )
}

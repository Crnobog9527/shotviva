import type { CostTable } from '../page-content'

// A real <table>, not an image: AI answers extract tables reliably (建站规格 G5).
export function CostTableView({ table }: { table: CostTable }) {
  const { headers } = table
  return (
    <table>
      <caption>{table.caption}</caption>
      <thead>
        <tr>
          <th scope="col">{headers.item}</th>
          <th scope="col">{headers.photographer}</th>
          {headers.diy && <th scope="col">{headers.diy}</th>}
          <th scope="col">{headers.site}</th>
        </tr>
      </thead>
      <tbody>
        {table.rows.map((row) => (
          <tr key={row.item}>
            <th scope="row">{row.item}</th>
            <td>{row.photographer}</td>
            {headers.diy && <td>{row.diy}</td>}
            <td>{row.site}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function CostTableSection({ table, heading }: { table: CostTable; heading: string }) {
  return (
    <section>
      <h2>{heading}</h2>
      <CostTableView table={table} />
    </section>
  )
}

import type { CostTable } from '../page-content'

// A real <table>, not an image: AI answers extract tables reliably (建站规格 G5).
export function CostTableSection({ table }: { table: CostTable }) {
  return (
    <section>
      <h2>{table.caption}</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">{table.headers.item}</th>
            <th scope="col">{table.headers.photographer}</th>
            <th scope="col">{table.headers.site}</th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.item}>
              <th scope="row">{row.item}</th>
              <td>{row.photographer}</td>
              <td>{row.site}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

import type { HomePage } from '../page-content'

// Names and uses are in the HTML source (建站规格 R5); real cards come with T3 data.
export function TemplateGrid({ grid }: { grid: HomePage['templateGrid'] }) {
  return (
    <section>
      <h2>{grid.heading}</h2>
      <ul className="grid grid-cols-2 gap-4">
        {grid.templates.map((template) => (
          <li key={template.name}>
            <h3>{template.name}</h3>
            <p>{template.use}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

import { Link } from '../../i18n/ui'
import { authorPath, type BlogAuthor } from '../authors'

// The byline's name: a registered author links to their page; any other name is plain text.
export function AuthorName({ name, author }: { name: string; author: BlogAuthor | null }) {
  if (!author) return <b>{name}</b>
  return (
    <Link href={authorPath(author.slug)} className="mk-blog-author-link">
      <b>{author.name}</b>
    </Link>
  )
}

import { Link } from '../../i18n/ui'
import type { Locale } from '../../i18n/locales'
import { authorPath, type BlogAuthor } from '../authors'
import { parseMarkdown, type TocEntry } from '../markdown'
import type { Post } from '../rules'
import { AuthorName } from './byline'
import { isoDay, longDate } from './dates'
import { BlocksView } from './markdown-view'
import './blog.css'

export type ArticleText = {
  home: string
  blog: string
  by: string
  published: string
  updated: string
  contents: string
  aboutAuthor: string
}

// A contents line is the heading up to its first ": " ("2. FoodShot AI: 200+ food styles" lists as
// "2. FoodShot AI"), so a list of named items stays one short line each.
const tocLabel = (text: string) => text.split(/[:：]\s*/)[0] || text

function Contents({ toc, title, side }: { toc: readonly TocEntry[]; title: string; side: boolean }) {
  const items = toc.map((entry) => (
    <li key={entry.id} className={entry.level === 3 ? 'sub' : undefined}>
      <a href={`#${entry.id}`}>{tocLabel(entry.text)}</a>
    </li>
  ))
  if (side) {
    return (
      <nav aria-label={title} className="mk-blog-toc mk-blog-toc-side">
        <p className="mk-blog-toc-title">{title}</p>
        <ol>{items}</ol>
      </nav>
    )
  }
  return (
    <details className="mk-blog-toc mk-blog-toc-fold">
      <summary>
        {title}
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>
      <ol>{items}</ol>
    </details>
  )
}

function Meta({ post, locale, text, author }: { post: Post; locale: Locale; text: ArticleText; author: BlogAuthor | null }) {
  const edited = isoDay(post.updatedAt) !== isoDay(post.publishedAt)
  return (
    <p className="mk-blog-meta">
      <span>
        {text.by} <AuthorName name={post.authorName} author={author} />
      </span>
      <span>
        {text.published} <time dateTime={post.publishedAt}>{longDate(post.publishedAt, locale)}</time>
      </span>
      {edited ? (
        <span>
          {text.updated} <time dateTime={post.updatedAt}>{longDate(post.updatedAt, locale)}</time>
        </span>
      ) : null}
    </p>
  )
}

function AuthorCard({ author, locale, title }: { author: BlogAuthor; locale: Locale; title: string }) {
  const text = author.text[locale]
  return (
    <aside className="mk-blog-author-card" aria-label={title}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a small /public portrait */}
      <img src={author.photo.src} alt={author.name} width={author.photo.width} height={author.photo.height} loading="lazy" decoding="async" />
      <div>
        <p className="mk-blog-author-card-title">{title}</p>
        <p className="mk-blog-author-card-name">
          <Link href={authorPath(author.slug)}>{author.name}</Link>
        </p>
        <p className="mk-blog-author-card-job">{text.jobTitle}</p>
        <p>{text.bio}</p>
      </div>
    </aside>
  )
}

// The reading page: the post's title is the page's one H1 (the body's own # headings are h2),
// then who and when, the cover, a contents list from the h2 / h3 headings, the text, and a
// short card on a registered author with a link to their page.
export function ArticleView({ post, text, author = null }: { post: Post; text: ArticleText; author?: BlogAuthor | null }) {
  const { blocks, toc } = parseMarkdown(post.bodyMd)
  const showToc = toc.length >= 2
  return (
    <article className={`mk-blog mk-w${showToc ? ' mk-blog-has-toc' : ''}`}>
      <nav aria-label={text.blog} className="mk-blog-crumbs">
        <ol>
          <li><Link href="/">{text.home}</Link></li>
          <li><Link href="/blog">{text.blog}</Link></li>
          <li aria-current="page">{post.title}</li>
        </ol>
      </nav>
      <header className="mk-blog-head">
        <h1>{post.title}</h1>
        <p className="mk-blog-lede">{post.description}</p>
        <Meta post={post} locale={post.locale} text={text} author={author} />
      </header>
      {post.coverUrl ? (
        <figure className="mk-blog-cover">
          {/* eslint-disable-next-line @next/next/no-img-element -- our own /assets address, shown at a fixed ratio */}
          <img src={post.coverUrl} alt={post.coverAlt ?? ''} fetchPriority="high" decoding="async" />
        </figure>
      ) : null}
      {showToc ? <Contents toc={toc} title={text.contents} side /> : null}
      {showToc ? <Contents toc={toc} title={text.contents} side={false} /> : null}
      <div className="mk-blog-text">
        <BlocksView blocks={blocks} />
      </div>
      {author ? <AuthorCard author={author} locale={post.locale} title={text.aboutAuthor} /> : null}
    </article>
  )
}

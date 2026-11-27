import { Link } from '../../i18n/ui'
import type { Locale } from '../../i18n/locales'
import { authorByName, type BlogAuthor } from '../authors'
import { postPath, type PostSummary } from '../rules'
import { AuthorName } from './byline'
import { longDate } from './dates'
import './blog.css'

export type BlogListText = { title: string; intro: string; empty: string; by: string }

type CardsProps = { posts: readonly PostSummary[]; locale: Locale; by: string; authors: readonly BlogAuthor[]; headingLevel?: 2 | 3 }

// One card per post, newest first. The post's title is the card's link; the whole card is
// clickable through it, except the author's name, which links to their page.
export function PostCards({ posts, locale, by, authors, headingLevel = 2 }: CardsProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3'
  return (
    <ul className="mk-blog-cards">
          {posts.map((post, i) => (
            <li key={post.id} className="mk-blog-card">
              {post.coverUrl ? (
                <div className="mk-blog-card-cover">
                  {/* eslint-disable-next-line @next/next/no-img-element -- our own /assets address, shown at a fixed ratio */}
                  <img src={post.coverUrl} alt={post.coverAlt ?? ''} loading={i < 2 ? 'eager' : 'lazy'} decoding="async" />
                </div>
              ) : null}
              <div className="mk-blog-card-body">
                <Heading><Link href={postPath(post.slug)}>{post.title}</Link></Heading>
                <p>{post.description}</p>
                <p className="mk-blog-meta">
                  <span>{by} <AuthorName name={post.authorName} author={authorByName(authors, post.authorName)} /></span>
                  <time dateTime={post.publishedAt}>{longDate(post.publishedAt, locale)}</time>
                </p>
              </div>
            </li>
          ))}
    </ul>
  )
}

// The /blog list.
export function BlogListView({ posts, locale, text, authors = [] }: { posts: readonly PostSummary[]; locale: Locale; text: BlogListText; authors?: readonly BlogAuthor[] }) {
  return (
    <div className="mk-blog mk-w">
      <header className="mk-blog-index-head">
        <h1>{text.title}</h1>
        <p>{text.intro}</p>
      </header>
      {posts.length === 0 ? <p className="mk-blog-empty">{text.empty}</p> : <PostCards posts={posts} locale={locale} by={text.by} authors={authors} />}
    </div>
  )
}

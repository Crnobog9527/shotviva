import { Link } from '../../i18n/ui'
import type { Locale } from '../../i18n/locales'
import type { BlogAuthor } from '../authors'
import type { PostSummary } from '../rules'
import { PostCards } from './blog-list-view'
import './blog.css'

export type AuthorPageText = { home: string; blog: string; by: string; roles: string; awards: string; brands: string; posts: string; noPosts: string }

// An author's page (/blog/author/<slug>): who they are, in the page's language, and their posts
// in that language. The name is the page's one H1.
export function AuthorView({ author, locale, posts, text }: { author: BlogAuthor; locale: Locale; posts: readonly PostSummary[]; text: AuthorPageText }) {
  const about = author.text[locale]
  return (
    <div className="mk-blog mk-w">
      <nav aria-label={text.blog} className="mk-blog-crumbs">
        <ol>
          <li><Link href="/">{text.home}</Link></li>
          <li><Link href="/blog">{text.blog}</Link></li>
          <li aria-current="page">{author.name}</li>
        </ol>
      </nav>
      <header className="mk-blog-head mk-blog-author-head">
        {/* eslint-disable-next-line @next/next/no-img-element -- a small /public portrait */}
        <img src={author.photo.src} alt={author.name} width={author.photo.width} height={author.photo.height} fetchPriority="high" decoding="async" />
        <div>
          <h1>{author.name}</h1>
          <p className="mk-blog-lede">{about.jobTitle}</p>
        </div>
      </header>
      <div className="mk-blog-text">
        <p>{about.bio}</p>
        <h2>{text.roles}</h2>
        <ul>{about.roles.map((line) => <li key={line}>{line}</li>)}</ul>
        <h2>{text.awards}</h2>
        <ul>{about.awards.map((line) => <li key={line}>{line}</li>)}</ul>
        <h2>{text.brands}</h2>
        <p>{about.brands.join(locale === 'zh' ? '、' : ', ')}</p>
        <h2>{text.posts}</h2>
      </div>
      {posts.length === 0 ? <p className="mk-blog-empty">{text.noPosts}</p> : <PostCards posts={posts} locale={locale} by={text.by} authors={[author]} headingLevel={3} />}
    </div>
  )
}

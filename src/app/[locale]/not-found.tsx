import { NotFoundView } from '@/core/content'

// notFound() anywhere under [locale] (an unknown template or photo), in the page's language.
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col">
      <NotFoundView />
    </main>
  )
}

import ContentRoute, { generateMetadata as contentMetadata } from '../../(marketing)/[slug]/page'

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

const contentProps = ({ params, searchParams }: Props) => ({
  params: params.then(({ locale }) => ({ locale, slug: 'commercial-photography' })),
  searchParams,
})

export const ensureStatic = 'shell'
export const generateMetadata = (props: Props) => contentMetadata(contentProps(props))
export default function CommercialPage(props: Props) { return ContentRoute(contentProps(props)) }

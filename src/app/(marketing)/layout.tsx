// Marketing shell (nav + content + footer) lands with T5/T11; the app shell
// is a separate route group with its own layout (ARCHITECTURE §1).
export default function MarketingLayout({ children }: LayoutProps<'/'>) {
  return <main className="flex flex-1 flex-col">{children}</main>
}

import "./globals.css"
import { inter, poppins } from './fonts'
import { Providers } from "@/components/Providers"
import LayoutShell from "@/components/LayoutShell"

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} ${poppins.variable}`}>
        <Providers>
          <LayoutShell>
            {children}
          </LayoutShell>
        </Providers>
      </body>
    </html>
  )
}

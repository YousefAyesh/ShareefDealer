import type { Metadata, Viewport } from 'next'
import { Archivo_Black, Inter } from 'next/font/google'
import { SiteFooter } from '@/components/SiteFooter'
import { SiteHeader } from '@/components/SiteHeader'
import { StickyCallBar } from '@/components/StickyCallBar'
import { DEALER, SITE_URL, assertRealDealerData } from '@/lib/dealer'
import './globals.css'

// Runs once when the server module is first evaluated. In a production
// build this throws on placeholder dealer data rather than shipping a fake
// phone number to real buyers -- see assertRealDealerData.
assertRealDealerData()

const archivoBlack = Archivo_Black({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-archivo-black',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const TITLE = `${DEALER.name} | Used Cars, Trucks & SUVs in ${DEALER.address.city}, ${DEALER.address.state}`
const DESCRIPTION = `Independent used car dealership in ${DEALER.address.city}, ${DEALER.address.state}. Browse our full lot online — trucks, SUVs and sedans with real photos, real prices and full specs. Call ${DEALER.phoneDisplay}.`

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: `%s | ${DEALER.name}`,
  },
  description: DESCRIPTION,
  applicationName: DEALER.name,
  // Dealer sites are scraped constantly by listing aggregators. This is not
  // enforcement, but it states the intent that Terms of Use also states.
  robots: { index: true, follow: true, 'max-image-preview': 'large' },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: DEALER.name,
    locale: 'en_US',
    type: 'website',
    images: [{ url: '/Logo.jpeg', width: 1206, height: 1183, alt: DEALER.name }],
  },
  twitter: {
    card: 'summary',
    title: TITLE,
    description: DESCRIPTION,
  },
  icons: { icon: '/Logo.jpeg', apple: '/Logo.jpeg' },
  formatDetection: { telephone: true, address: true },
}

export const viewport: Viewport = {
  themeColor: '#182848',
  // Explicitly allow zooming. Locking scale is a common template default
  // and an outright accessibility failure for anyone who needs to enlarge
  // a VIN or a price.
  initialScale: 1,
  width: 'device-width',
  maximumScale: 5,
  userScalable: true,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${archivoBlack.variable} ${inter.variable}`}>
      <body className="flex min-h-screen flex-col bg-cream text-navy antialiased">
        {/* Visually hidden until focused. The first Tab on any page should
            offer a way past the header, or a keyboard user tabs through the
            whole nav on every single vehicle they look at. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-modal focus:rounded-md focus:bg-navy focus:px-4 focus:py-3 focus:text-sm focus:font-bold focus:text-cream"
        >
          Skip to main content
        </a>

        <SiteHeader />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
        <StickyCallBar />
        {/* Spacer so the fixed mobile call bar never covers footer content. */}
        <div className="h-16 md:hidden" aria-hidden="true" />
      </body>
    </html>
  )
}

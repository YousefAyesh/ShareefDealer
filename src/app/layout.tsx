import type { Metadata } from 'next'
import { Archivo_Black, Inter } from 'next/font/google'
import { SiteFooter } from '@/components/SiteFooter'
import { SiteHeader } from '@/components/SiteHeader'
import { StickyCallBar } from '@/components/StickyCallBar'
import { SITE_URL } from '@/lib/dealer'
import './globals.css'

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

const TITLE = 'Roadstar Auto Sales | Buy Here Pay Here — Austin, TX'
const DESCRIPTION =
  'Buy Here Pay Here used car dealer in Austin, Texas. Your job is your credit. Trucks, SUVs and sedans on the lot now — down payment and weekly payment terms shown up front.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: '%s | Roadstar Auto Sales',
  },
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: 'Roadstar Auto Sales',
    locale: 'en_US',
    type: 'website',
    images: [{ url: '/Logo.jpeg', width: 1206, height: 1183, alt: 'Roadstar Auto Sales' }],
  },
  twitter: {
    card: 'summary',
    title: TITLE,
    description: DESCRIPTION,
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${archivoBlack.variable} ${inter.variable}`}>
      <body className="flex min-h-screen flex-col bg-cream text-navy antialiased">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
        <StickyCallBar />
        {/* Spacer so the fixed mobile call bar never covers footer content. */}
        <div className="h-16 md:hidden" aria-hidden="true" />
      </body>
    </html>
  )
}

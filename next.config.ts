import type { NextConfig } from 'next'

/**
 * Vercel Blob serves every synced vehicle photo from a per-store subdomain
 * of public.blob.vercel-storage.com. next/image refuses any remote host not
 * listed here and throws at request time, so without this entry the entire
 * site 500s on real inventory the moment DEMO_MODE is turned off -- while
 * looking perfectly fine in demo mode, where photos are local files.
 */
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**.public.blob.vercel-storage.com' }],
    // The synced photo variants are already sized and WebP-encoded by
    // src/lib/frazer/photos.ts, so this list only needs the widths the
    // layout actually renders at.
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [96, 160, 256, 384],
    formats: ['image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },

  // Don't advertise the framework version to scanners.
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Defense in depth for a site with no login and no forms: cheap to
          // set, and they close off the framing and MIME-sniffing tricks
          // used to dress a dealer's domain up as something else.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ]
  },
}

export default nextConfig

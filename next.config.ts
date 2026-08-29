import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  /**
   * The inventory lives in JSON files that src/lib/inventory.ts reads with
   * fs at request time. Next's dependency tracer only follows `import`
   * statements, so it cannot see a runtime readdir of a folder and would
   * leave inventory/ out of the deployed bundle entirely -- producing a
   * site that works perfectly in `next dev` and shows an empty lot in
   * production. Naming the folder here puts it in the bundle.
   *
   * public/ is copied verbatim by the platform, so the photos need no
   * equivalent entry.
   */
  outputFileTracingIncludes: {
    '/**': ['./inventory/**/*.json'],
  },

  images: {
    /**
     * No remotePatterns: every photo is a local file under public/, served
     * from the site's own origin. next/image still resizes and re-encodes
     * them on demand, which is why scripts/photos.mjs stores exactly one
     * copy of each picture instead of a thumb/card/full set.
     */
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

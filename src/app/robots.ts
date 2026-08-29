import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/dealer'

/**
 * Deliberately minimal.
 *
 * The obvious move is to disallow the filtered listing URLs, since a lot of
 * 40 cars generates thousands of filter permutations that are all the same
 * content resliced. That move is a trap: a URL blocked in robots.txt is
 * never fetched, so the `noindex` those pages already send in their
 * metadata is never seen, and Google may index the URL anyway from inbound
 * links -- with no content, because it was not allowed to look. Blocking is
 * strictly worse than letting the crawler read the noindex and canonical
 * that /inventory already sends.
 *
 * /admin is listed for tidiness, not security -- it is behind HTTP basic
 * auth in middleware.ts. robots.txt is a public file and deters no one.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/api/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}

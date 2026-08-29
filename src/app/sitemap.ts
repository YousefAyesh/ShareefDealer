import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/dealer'
import { getAllListableVehicles } from '@/lib/inventory'

/**
 * Every URL worth indexing, regenerated on the same cadence as the
 * inventory sync.
 *
 * Vehicle pages are the whole point: a dealer's organic traffic comes
 * almost entirely from people searching a specific year/make/model near
 * them, landing on one VDP. Without a sitemap those pages are discoverable
 * only by crawling the paginated listing, which is slow and, for a car that
 * sells in three weeks, often too slow to matter.
 *
 * Only listable vehicles appear -- a sold car's page is set to noindex, so
 * listing it here would ask Google to crawl a page we've told it to drop.
 */
export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/inventory`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/visit`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/about`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.1 },
    { url: `${SITE_URL}/terms`, changeFrequency: 'yearly', priority: 0.1 },
    { url: `${SITE_URL}/accessibility`, changeFrequency: 'yearly', priority: 0.2 },
  ]

  let vehicleRoutes: MetadataRoute.Sitemap = []
  try {
    const vehicles = await getAllListableVehicles()
    vehicleRoutes = vehicles.map((v) => ({
      url: `${SITE_URL}/inventory/${v.slug}`,
      lastModified: new Date(v.createdAt),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }))
  } catch (error) {
    // A database hiccup must not take the whole sitemap down. Serving the
    // static routes alone is strictly better than a 500, which Google
    // treats as "this sitemap is broken" rather than "try again".
    console.error('sitemap: failed to load vehicles, serving static routes only', error)
  }

  return [...staticRoutes, ...vehicleRoutes]
}

import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * SITE_URL is computed once at module load, so each case has to re-import
 * the module with a different environment.
 */
async function siteUrlWith(env: Record<string, string | undefined>): Promise<string> {
  vi.resetModules()
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) vi.stubEnv(key, '')
    else vi.stubEnv(key, value)
  }
  const mod = await import('@/lib/dealer')
  return mod.SITE_URL
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('SITE_URL resolution', () => {
  it('prefers an explicitly configured domain', async () => {
    const url = await siteUrlWith({
      NEXT_PUBLIC_SITE_URL: 'https://roadstarautosales.com',
      VERCEL_PROJECT_PRODUCTION_URL: 'shareefdealer.vercel.app',
    })
    expect(url).toBe('https://roadstarautosales.com')
  })

  it("falls back to Vercel's stable production domain", async () => {
    // Saves having to set an env var by hand just to deploy, and is right
    // by construction: canonical tags point at the live domain.
    const url = await siteUrlWith({
      NEXT_PUBLIC_SITE_URL: undefined,
      VERCEL_PROJECT_PRODUCTION_URL: 'shareefdealer.vercel.app',
    })
    expect(url).toBe('https://shareefdealer.vercel.app')
  })

  it('adds the protocol Vercel omits', async () => {
    const url = await siteUrlWith({
      NEXT_PUBLIC_SITE_URL: undefined,
      VERCEL_PROJECT_PRODUCTION_URL: 'shareefdealer.vercel.app',
    })
    expect(url.startsWith('https://')).toBe(true)
  })

  it('strips a trailing slash, which would double up in every built URL', async () => {
    const url = await siteUrlWith({ NEXT_PUBLIC_SITE_URL: 'https://roadstarautosales.com/' })
    expect(url).toBe('https://roadstarautosales.com')
  })

  it('does not double the protocol if Vercel ever includes one', async () => {
    const url = await siteUrlWith({
      NEXT_PUBLIC_SITE_URL: undefined,
      VERCEL_PROJECT_PRODUCTION_URL: 'https://shareefdealer.vercel.app',
    })
    expect(url).toBe('https://shareefdealer.vercel.app')
  })

  it('falls back to the reserved domain the guard rejects when nothing is set', async () => {
    const url = await siteUrlWith({
      NEXT_PUBLIC_SITE_URL: undefined,
      VERCEL_PROJECT_PRODUCTION_URL: undefined,
    })
    expect(url).toContain('.example')
  })
})

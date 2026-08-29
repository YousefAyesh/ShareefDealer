'use client'

/**
 * Last-resort boundary: catches errors thrown in the root layout itself,
 * where SiteHeader/SiteFooter and the site's CSS may never have rendered.
 * It therefore ships its own <html>/<body> and inline styles rather than
 * relying on anything from the app -- if it depended on the layout that
 * just crashed, it would crash too.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          textAlign: 'center',
          background: '#f5f1e6',
          color: '#182848',
          fontFamily: 'system-ui, -apple-system, Arial, sans-serif',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.75rem', textTransform: 'uppercase', letterSpacing: '-0.02em' }}>
            Something went wrong
          </h1>
          <p style={{ marginTop: '1rem', maxWidth: '30rem' }}>
            Sorry — the site hit an unexpected problem. Please try again in a moment.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '1.5rem',
              minHeight: '3rem',
              padding: '0 1.5rem',
              cursor: 'pointer',
              borderRadius: '0.375rem',
              border: 0,
              background: '#b83828',
              color: '#f5f1e6',
              fontSize: '1rem',
              fontWeight: 700,
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export const config = { matcher: ['/admin/:path*', '/api/admin/:path*'] }

export function middleware(request: NextRequest) {
  const expected = process.env.ADMIN_PASSWORD
  if (!expected) {
    return new NextResponse('Admin access is not configured', { status: 503 })
  }

  const header = request.headers.get('authorization')
  if (header?.startsWith('Basic ')) {
    const decoded = atob(header.slice(6))
    const password = decoded.slice(decoded.indexOf(':') + 1)
    if (password && password === expected) {
      return NextResponse.next()
    }
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Admin"' },
  })
}

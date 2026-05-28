import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function proxy(req: NextRequest) {
  let res = NextResponse.next({
    request: { headers: req.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll().map(({ name, value }) => ({ name, value }))
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            req.cookies.set(name, value)
            res = NextResponse.next({ request: { headers: req.headers } })
            res.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // Refresh session — required for Server Components to read auth state
  const { data: { user }, error } = await supabase.auth.getUser()

  // Protect /dashboard — redirect to sign-in if not authenticated
  if (req.nextUrl.pathname.startsWith('/dashboard') && error) {
    return NextResponse.redirect(new URL('/sign-in', req.url))
  }

  // Redirect logged-in users from landing page to dashboard
  if (req.nextUrl.pathname === '/' && !error && user) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  return res
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico
     * - api/track (email open tracking pixel — must be public)
     * - static image files
     */
    '/((?!_next/static|_next/image|favicon.ico|api/track|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

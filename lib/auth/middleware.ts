import { NextResponse, type NextRequest } from 'next/server'
import { auth } from './auth'
import { prisma } from '@/lib/db/prisma'

/**
 * Auth middleware for proxy.ts (replaces lib/supabase/middleware.ts)
 *
 * Handles:
 * - Skip /api/* routes (Route Handlers handle their own auth)
 * - Check if instance is initialized (redirect to /setup if not)
 * - Redirect unauthenticated users to /login
 * - Redirect authenticated users away from /login
 */
export async function updateSession(request: NextRequest) {
  // Skip API routes
  if (request.nextUrl.pathname.startsWith('/api')) {
    return NextResponse.next({ request })
  }

  const pathname = request.nextUrl.pathname
  const isSetupRoute = pathname === '/setup' || pathname.startsWith('/setup/')
  const isInstallRoute = pathname === '/install' || pathname.startsWith('/install/')
  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/auth')
  const isPublicRoute = pathname === '/' || pathname.startsWith('/join') || isSetupRoute || isInstallRoute

  // Check if instance is initialized
  try {
    const orgCount = await prisma.organization.count()
    if (orgCount === 0 && !isSetupRoute && !isInstallRoute) {
      const url = request.nextUrl.clone()
      url.pathname = '/setup'
      return NextResponse.redirect(url)
    }
  } catch {
    // Fail open - don't block navigation if DB is unavailable
  }

  // Get session via NextAuth
  const session = await auth()

  // Redirect unauthenticated users to login (unless on public route)
  if (!session?.user && !isAuthRoute && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Redirect authenticated users away from login
  if (session?.user && isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return NextResponse.next({ request })
}

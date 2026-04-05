import { auth } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'

export interface AuthContext {
  userId: string
  email: string
  role: string
  organizationId: string | null
}

/**
 * Get current authenticated user context.
 * Throws if not authenticated.
 */
export async function requireAuth(): Promise<AuthContext> {
  const session = await auth()
  if (!session?.user?.id) {
    throw new Error('Not authenticated')
  }

  return {
    userId: session.user.id,
    email: session.user.email ?? '',
    role: session.user.role ?? 'user',
    organizationId: session.user.organizationId ?? null,
  }
}

/**
 * Get current authenticated admin user context.
 * Throws if not authenticated or not admin.
 */
export async function requireAdmin(): Promise<AuthContext> {
  const ctx = await requireAuth()
  if (ctx.role !== 'admin') {
    throw new Error('Forbidden: admin role required')
  }
  return ctx
}

/**
 * Get current user's organization ID.
 * Returns null if no org.
 */
export async function getCurrentOrganizationId(): Promise<string | null> {
  const session = await auth()
  if (!session?.user?.id) return null

  if (session.user.organizationId) {
    return session.user.organizationId
  }

  // Fallback: fetch from profile
  const profile = await prisma.profile.findUnique({
    where: { id: session.user.id },
    select: { organizationId: true },
  })

  return profile?.organizationId ?? null
}

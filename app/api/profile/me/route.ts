import { auth } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const profile = await prisma.profile.findUnique({
    where: { id: session.user.id },
  })

  if (!profile) {
    return Response.json({ error: 'Profile not found' }, { status: 404 })
  }

  // Return in the format expected by AuthContext (snake_case for compatibility)
  return Response.json({
    id: profile.id,
    email: profile.email,
    name: profile.name,
    organization_id: profile.organizationId,
    role: profile.role,
    first_name: profile.firstName,
    last_name: profile.lastName,
    nickname: profile.nickname,
    phone: profile.phone,
    avatar_url: profile.avatarUrl,
    created_at: profile.createdAt?.toISOString(),
  })
}

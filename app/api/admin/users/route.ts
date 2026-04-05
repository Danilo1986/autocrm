import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth/auth';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return json({ error: 'Unauthorized' }, 401);

  const me = await prisma.profile.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, organizationId: true },
  });

  if (!me?.organizationId) return json({ error: 'Profile not found' }, 404);
  if (me.role !== 'admin') return json({ error: 'Forbidden' }, 403);

  const profiles = await prisma.profile.findMany({
    where: { organizationId: me.organizationId },
    select: { id: true, email: true, role: true, organizationId: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  const users = profiles.map((p) => ({
    id: p.id,
    email: p.email,
    role: p.role,
    organization_id: p.organizationId,
    created_at: p.createdAt,
    status: 'active' as const,
  }));

  return json({ users });
}

export async function POST(req: Request) {
  if (!isAllowedOrigin(req)) return json({ error: 'Forbidden' }, 403);
  return json({ error: 'Not implemented' }, 501);
}

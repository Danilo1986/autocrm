import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth/auth';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isAllowedOrigin(req)) return json({ error: 'Forbidden' }, 403);

  const { id } = await ctx.params;

  const session = await auth();
  if (!session?.user?.id) return json({ error: 'Unauthorized' }, 401);

  const me = await prisma.profile.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, organizationId: true },
  });

  if (!me?.organizationId) return json({ error: 'Profile not found' }, 404);
  if (me.role !== 'admin') return json({ error: 'Forbidden' }, 403);

  if (id === session.user.id) return json({ error: 'Você não pode remover a si mesmo' }, 400);

  const target = await prisma.profile.findUnique({
    where: { id },
    select: { id: true, email: true, organizationId: true },
  });

  if (!target) return json({ error: 'User not found' }, 404);
  if (target.organizationId !== me.organizationId) return json({ error: 'Forbidden' }, 403);

  try {
    await prisma.profile.deleteMany({ where: { id } });
    await prisma.user.deleteMany({ where: { id } });
  } catch (deleteErr: any) {
    return json({ error: deleteErr.message || 'Failed to delete user' }, 500);
  }

  return json({ ok: true });
}

import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth/auth';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;

  const session = await auth();
  if (!session?.user?.id) return json({ error: 'Unauthorized' }, 401);

  const me = await prisma.profile.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, organizationId: true },
  });

  if (!me?.organizationId) return json({ error: 'Profile not found' }, 404);
  if (me.role !== 'admin') return json({ error: 'Forbidden' }, 403);

  const data = await prisma.aiPromptTemplate.findMany({
    where: { organizationId: me.organizationId, key },
    select: { key: true, content: true, version: true, isActive: true, createdAt: true, updatedAt: true, createdBy: true },
    orderBy: { version: 'desc' },
    take: 20,
  });

  const active = data.find((r) => r.isActive) || null;
  return json({ key, active, versions: data });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ key: string }> }) {
  if (!isAllowedOrigin(req)) return json({ error: 'Forbidden' }, 403);

  const { key } = await ctx.params;

  const session = await auth();
  if (!session?.user?.id) return json({ error: 'Unauthorized' }, 401);

  const me = await prisma.profile.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, organizationId: true },
  });

  if (!me?.organizationId) return json({ error: 'Profile not found' }, 404);
  if (me.role !== 'admin') return json({ error: 'Forbidden' }, 403);

  try {
    await prisma.aiPromptTemplate.updateMany({
      where: {
        organizationId: me.organizationId,
        key,
        isActive: true,
      },
      data: { isActive: false },
    });
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }

  return json({ ok: true });
}

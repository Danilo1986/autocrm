import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth/auth';

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

async function getContext() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const profile = await prisma.profile.findUnique({
    where: { id: session.user.id },
    select: { id: true, organizationId: true },
  });
  if (!profile?.organizationId) return null;
  return { userId: session.user.id, organizationId: profile.organizationId };
}

export async function GET() {
  const ctx = await getContext();
  if (!ctx) return json({ error: 'Unauthorized' }, 401);

  try {
    const data = await prisma.apiKey.findMany({
      where: { organizationId: ctx.organizationId },
      select: {
        id: true, name: true, keyPrefix: true,
        createdAt: true, lastUsedAt: true, revokedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const mapped = data.map(k => ({
      id: k.id,
      name: k.name,
      key_prefix: k.keyPrefix,
      created_at: k.createdAt,
      last_used_at: k.lastUsedAt,
      revoked_at: k.revokedAt,
    }));

    return json({ data: mapped });
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
}

export async function POST(req: Request) {
  const ctx = await getContext();
  if (!ctx) return json({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => null);
  if (!body) return json({ error: 'Invalid payload' }, 400);

  const { action } = body;

  try {
    switch (action) {
      case 'create': {
        const { apiKeysService } = await import('@/lib/services/apiKeys');
        const result = await apiKeysService.create(ctx.organizationId, body.name || 'Integração', ctx.userId);
        if (result.error) return json({ error: result.error.message }, 500);
        return json({
          token: result.data?.token,
          key_prefix: result.data?.keyPrefix,
        });
      }
      case 'revoke': {
        const { apiKeysService } = await import('@/lib/services/apiKeys');
        const result = await apiKeysService.revoke(body.id, ctx.organizationId);
        if (result.error) return json({ error: result.error.message }, 500);
        return json({ ok: true });
      }
      case 'delete': {
        // Only allow deleting revoked keys
        await prisma.apiKey.deleteMany({
          where: {
            id: body.id,
            organizationId: ctx.organizationId,
            revokedAt: { not: null },
          },
        });
        return json({ ok: true });
      }
      default:
        return json({ error: 'Unknown action' }, 400);
    }
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
}

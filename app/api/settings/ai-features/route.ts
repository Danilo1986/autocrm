import { z } from 'zod';
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

  const data = await prisma.aiFeatureFlag.findMany({
    where: { organizationId: me.organizationId },
    select: { key: true, enabled: true, updatedAt: true },
  });

  const flags: Record<string, boolean> = {};
  for (const row of data) flags[row.key] = Boolean(row.enabled);

  return json({
    isAdmin: me.role === 'admin',
    flags,
  });
}

const UpdateFeatureSchema = z
  .object({
    key: z.string().min(3).max(120),
    enabled: z.boolean(),
  })
  .strict();

export async function POST(req: Request) {
  if (!isAllowedOrigin(req)) return json({ error: 'Forbidden' }, 403);

  const session = await auth();
  if (!session?.user?.id) return json({ error: 'Unauthorized' }, 401);

  const me = await prisma.profile.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, organizationId: true },
  });

  if (!me?.organizationId) return json({ error: 'Profile not found' }, 404);
  if (me.role !== 'admin') return json({ error: 'Forbidden' }, 403);

  const rawBody = await req.json().catch(() => null);
  const parsed = UpdateFeatureSchema.safeParse(rawBody);
  if (!parsed.success) return json({ error: 'Invalid payload', details: parsed.error.flatten() }, 400);

  const { key, enabled } = parsed.data;

  try {
    await prisma.aiFeatureFlag.upsert({
      where: {
        organizationId_key: {
          organizationId: me.organizationId,
          key,
        },
      },
      create: {
        organizationId: me.organizationId,
        key,
        enabled,
      },
      update: { enabled },
    });
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }

  return json({ ok: true });
}

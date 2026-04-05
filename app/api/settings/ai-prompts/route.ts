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
  if (me.role !== 'admin') return json({ error: 'Forbidden' }, 403);

  const data = await prisma.aiPromptTemplate.findMany({
    where: { organizationId: me.organizationId },
    select: { key: true, version: true, isActive: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
  });

  const activeByKey: Record<string, { version: number; updatedAt: Date }> = {};
  for (const row of data) {
    if (row.isActive && !activeByKey[row.key]) {
      activeByKey[row.key] = { version: row.version, updatedAt: row.updatedAt };
    }
  }

  return json({ activeByKey });
}

const UpsertPromptSchema = z
  .object({
    key: z.string().min(3).max(120),
    content: z.string().min(1).max(50_000),
  })
  .strict();

export async function POST(req: Request) {
  if (!isAllowedOrigin(req)) return json({ error: 'Forbidden' }, 403);

  const session = await auth();
  if (!session?.user?.id) return json({ error: 'Unauthorized' }, 401);

  const rawBody = await req.json().catch(() => null);
  const parsed = UpsertPromptSchema.safeParse(rawBody);
  if (!parsed.success) return json({ error: 'Invalid payload', details: parsed.error.flatten() }, 400);

  const me = await prisma.profile.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, organizationId: true },
  });

  if (!me?.organizationId) return json({ error: 'Profile not found' }, 404);
  if (me.role !== 'admin') return json({ error: 'Forbidden' }, 403);

  const { key, content } = parsed.data;

  try {
    // Determine next version
    const existing = await prisma.aiPromptTemplate.findFirst({
      where: { organizationId: me.organizationId, key },
      select: { version: true },
      orderBy: { version: 'desc' },
    });

    const lastVersion = existing?.version ?? 0;
    const nextVersion = lastVersion + 1;

    // Deactivate previous active version
    await prisma.aiPromptTemplate.updateMany({
      where: {
        organizationId: me.organizationId,
        key,
        isActive: true,
      },
      data: { isActive: false },
    });

    // Create new version
    await prisma.aiPromptTemplate.create({
      data: {
        organizationId: me.organizationId,
        key,
        version: nextVersion,
        content,
        isActive: true,
        createdBy: me.id,
      },
    });

    return json({ ok: true, key, version: nextVersion });
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
}

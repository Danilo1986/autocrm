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

const CreateInviteSchema = z
  .object({
    role: z.enum(['admin', 'vendedor']).default('vendedor'),
    expiresAt: z.union([z.string().datetime(), z.null()]).optional(),
    email: z.string().email().optional(),
  })
  .strict();

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return json({ error: 'Unauthorized' }, 401);

  const me = await prisma.profile.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, organizationId: true },
  });

  if (!me?.organizationId) return json({ error: 'Profile not found' }, 404);
  if (me.role !== 'admin') return json({ error: 'Forbidden' }, 403);

  const invites = await prisma.organizationInvite.findMany({
    where: {
      organizationId: me.organizationId,
      usedAt: null,
    },
    select: {
      id: true, token: true, role: true, email: true,
      createdAt: true, expiresAt: true, usedAt: true, createdBy: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  // Map to snake_case for backwards compat
  const mapped = invites.map(i => ({
    id: i.id,
    token: i.token,
    role: i.role,
    email: i.email,
    created_at: i.createdAt,
    expires_at: i.expiresAt,
    used_at: i.usedAt,
    created_by: i.createdBy,
  }));

  return json({ invites: mapped });
}

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

  const raw = await req.json().catch(() => null);
  const parsed = CreateInviteSchema.safeParse(raw);
  if (!parsed.success) {
    console.error('[admin/invites POST] Validation error:', parsed.error.flatten());
    return json({ error: 'Invalid payload', details: parsed.error.flatten() }, 400);
  }

  const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;

  try {
    const invite = await prisma.organizationInvite.create({
      data: {
        organizationId: me.organizationId,
        role: parsed.data.role,
        email: parsed.data.email ?? null,
        expiresAt,
        createdBy: me.id,
      },
      select: {
        id: true, token: true, role: true, email: true,
        createdAt: true, expiresAt: true, usedAt: true, createdBy: true,
      },
    });

    const mapped = {
      id: invite.id,
      token: invite.token,
      role: invite.role,
      email: invite.email,
      created_at: invite.createdAt,
      expires_at: invite.expiresAt,
      used_at: invite.usedAt,
      created_by: invite.createdBy,
    };

    console.log('[admin/invites POST] Created invite:', { id: invite.id, token: invite.token, expires_at: invite.expiresAt });
    return json({ invite: mapped }, 201);
  } catch (err: any) {
    console.error('[admin/invites POST] Database error:', err);
    return json({ error: err.message }, 500);
  }
}

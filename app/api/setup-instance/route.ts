import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

const SetupSchema = z
  .object({
    companyName: z.string().min(1).max(200),
    email: z.string().email(),
    password: z.string().min(6),
  })
  .strict();

export async function POST(req: Request) {
  if (!isAllowedOrigin(req)) return json({ error: 'Forbidden' }, 403);

  const raw = await req.json().catch(() => null);
  const parsed = SetupSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: 'Invalid payload', details: parsed.error.flatten() }, 400);
  }

  const { companyName, email, password } = parsed.data;

  // Check if instance is already initialized (any organization exists)
  const orgCount = await prisma.organization.count();
  if (orgCount > 0) return json({ error: 'Instance already initialized' }, 403);

  let organization: { id: string; name: string };
  try {
    organization = await prisma.organization.create({
      data: { name: companyName },
      select: { id: true, name: true },
    });
  } catch (orgError: any) {
    return json({ error: orgError.message }, 500);
  }

  // Create user
  const { default: bcrypt } = await import('bcryptjs');
  const hashedPassword = await bcrypt.hash(password, 12);
  const { randomUUID } = await import('crypto');

  let userId: string;
  try {
    const user = await prisma.user.create({
      data: {
        id: randomUUID(),
        email,
        password: hashedPassword,
      },
    });
    userId = user.id;
  } catch (userError: any) {
    await prisma.organization.delete({ where: { id: organization.id } }).catch(() => {});
    return json({ error: userError.message || 'Failed to create user' }, 400);
  }

  const displayName = email.split('@')[0];

  try {
    await prisma.profile.upsert({
      where: { id: userId },
      create: {
        id: userId,
        email,
        name: displayName,
        firstName: displayName,
        organizationId: organization.id,
        role: 'admin',
      },
      update: {
        email,
        name: displayName,
        firstName: displayName,
        organizationId: organization.id,
        role: 'admin',
      },
    });
  } catch (profileError: any) {
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await prisma.organization.delete({ where: { id: organization.id } }).catch(() => {});
    return json({ error: profileError.message }, 400);
  }

  return json({ ok: true, organization, user: { id: userId, email } }, 201);
}

import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth/auth';

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return json({ error: 'Unauthorized' }, 401);

  const me = await prisma.profile.findUnique({
    where: { id: session.user.id },
    select: { role: true, organizationId: true },
  });
  if (!me?.organizationId || me.role !== 'admin') return json({ error: 'Forbidden' }, 403);

  const url = new URL(req.url);
  const severity = url.searchParams.get('severity');
  const action = url.searchParams.get('action');
  const from = url.searchParams.get('from');

  try {
    const where: any = {};
    // audit_logs may not be scoped to org - filter by what's available
    if (severity && severity !== 'all') where.severity = severity;
    if (action && action !== 'all') where.action = action;
    if (from) where.createdAt = { gte: new Date(from) };

    const data = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Map to snake_case
    const mapped = data.map(d => ({
      id: d.id,
      user_id: d.userId,
      action: d.action,
      resource_type: d.resourceType,
      resource_id: d.resourceId,
      details: d.details,
      ip_address: d.ipAddress,
      user_agent: d.userAgent,
      severity: d.severity,
      created_at: d.createdAt,
    }));

    return json({ data: mapped });
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
}

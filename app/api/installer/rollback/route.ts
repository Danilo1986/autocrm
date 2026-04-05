import { z } from 'zod';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';
import { prisma } from '@/lib/db/prisma';

export const maxDuration = 60;
export const runtime = 'nodejs';

const RollbackSchema = z.object({
  supabase: z.object({
    url: z.string().url(),
    serviceRoleKey: z.string().min(1),
  }),
  actions: z.array(z.enum([
    'delete_admin',
    'delete_organization',
    'truncate_tables',
  ])).min(1),
});

export async function POST(req: Request) {
  const t0 = Date.now();
  const log = (msg: string) => console.log('[rollback]', ((Date.now() - t0) / 1000).toFixed(1) + 's', msg);

  log('START');

  if (!isAllowedOrigin(req)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = RollbackSchema.safeParse(raw);

  if (!parsed.success) {
    log('ERROR: Invalid payload');
    return Response.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 });
  }

  const { actions } = parsed.data;

  const results: { action: string; success: boolean; error?: string }[] = [];

  for (const action of actions) {
    log(`Executing: ${action}`);

    try {
      switch (action) {
        case 'delete_admin': {
          // Delete admin profiles and their users
          const admins = await prisma.profile.findMany({
            where: { role: 'admin' },
            select: { id: true },
          });

          if (admins.length > 0) {
            const adminIds = admins.map(a => a.id);
            await prisma.profile.deleteMany({ where: { id: { in: adminIds } } });
            await prisma.user.deleteMany({ where: { id: { in: adminIds } } });
            for (const admin of admins) {
              log(`Deleted admin user: ${admin.id}`);
            }
          }

          results.push({ action, success: true });
          break;
        }

        case 'delete_organization': {
          await prisma.organization.deleteMany({
            where: { id: { not: '00000000-0000-0000-0000-000000000000' } },
          });
          results.push({ action, success: true });
          break;
        }

        case 'truncate_tables': {
          // Delete from tables in order (respecting FK constraints)
          await prisma.activity.deleteMany({});
          await prisma.deal.deleteMany({});
          await prisma.contact.deleteMany({});
          await prisma.crmCompany.deleteMany({});
          await prisma.board.deleteMany({});
          await prisma.profile.deleteMany({});
          await prisma.organization.deleteMany({});

          results.push({ action, success: true });
          break;
        }
      }

      log(`${action} completed`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      log(`${action} failed: ${errorMsg}`);
      results.push({ action, success: false, error: errorMsg });
    }
  }

  const allSuccess = results.every(r => r.success);
  log(`DONE - ${allSuccess ? 'All actions succeeded' : 'Some actions failed'}`);

  return Response.json({
    ok: allSuccess,
    results,
  });
}

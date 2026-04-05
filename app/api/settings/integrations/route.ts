import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth/auth';

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

async function getAdminContext() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const profile = await prisma.profile.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, organizationId: true },
  });
  if (!profile?.organizationId || profile.role !== 'admin') return null;
  return { userId: session.user.id, organizationId: profile.organizationId };
}

export async function GET(req: Request) {
  const ctx = await getAdminContext();
  if (!ctx) return json({ error: 'Forbidden' }, 403);

  const url = new URL(req.url);
  const type = url.searchParams.get('type'); // 'inbound' | 'outbound' | 'events'
  const sourceId = url.searchParams.get('source_id');

  try {
    if (type === 'outbound') {
      const data = await prisma.integrationOutboundEndpoint.findFirst({
        where: { organizationId: ctx.organizationId },
        select: { id: true, name: true, url: true, secret: true, active: true },
        orderBy: { createdAt: 'desc' },
      });
      return json({ data });
    }

    if (type === 'events' && sourceId) {
      const data = await prisma.webhookEventIn.findMany({
        where: { organizationId: ctx.organizationId, sourceId },
        select: { id: true, receivedAt: true, status: true, externalEventId: true, error: true, createdDealId: true },
        orderBy: { receivedAt: 'desc' },
        take: 3,
      });
      // Map to snake_case
      return json({ data: data.map(d => ({
        id: d.id,
        received_at: d.receivedAt,
        status: d.status,
        external_event_id: d.externalEventId,
        error: d.error,
        created_deal_id: d.createdDealId,
      })) });
    }

    // Default: list inbound sources
    const data = await prisma.integrationInboundSource.findMany({
      where: { organizationId: ctx.organizationId },
      select: { id: true, name: true, entryBoardId: true, entryStageId: true, secret: true, active: true },
      orderBy: { createdAt: 'desc' },
    });
    return json({ data: data.map(d => ({
      id: d.id,
      name: d.name,
      entry_board_id: d.entryBoardId,
      entry_stage_id: d.entryStageId,
      secret: d.secret,
      active: d.active,
    })) });
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
}

export async function POST(req: Request) {
  const ctx = await getAdminContext();
  if (!ctx) return json({ error: 'Forbidden' }, 403);

  const body = await req.json().catch(() => null);
  if (!body) return json({ error: 'Invalid payload' }, 400);

  const { action } = body;

  try {
    switch (action) {
      case 'create_inbound': {
        const { entry_board_id, entry_stage_id, secret, name } = body;
        const data = await prisma.integrationInboundSource.create({
          data: {
            organizationId: ctx.organizationId,
            name: name || 'Entrada de Leads',
            entryBoardId: entry_board_id,
            entryStageId: entry_stage_id,
            secret,
            active: true,
          },
          select: { id: true },
        });
        return json({ data });
      }
      case 'update_inbound': {
        const { id, entry_board_id, entry_stage_id, active } = body;
        const updates: any = {};
        if (entry_board_id !== undefined) updates.entryBoardId = entry_board_id;
        if (entry_stage_id !== undefined) updates.entryStageId = entry_stage_id;
        if (active !== undefined) updates.active = active;
        await prisma.integrationInboundSource.update({ where: { id }, data: updates });
        return json({ ok: true });
      }
      case 'delete_inbound': {
        await prisma.integrationInboundSource.delete({ where: { id: body.id } });
        return json({ ok: true });
      }
      case 'create_outbound': {
        const { name, url, secret, events } = body;
        const data = await prisma.integrationOutboundEndpoint.create({
          data: {
            organizationId: ctx.organizationId,
            name: name || 'Follow-up (Webhook)',
            url,
            secret,
            events: events || ['deal.stage_changed'],
            active: true,
          },
          select: { id: true, name: true, url: true, secret: true, active: true },
        });
        return json({ data: { id: data.id, name: data.name, url: data.url, secret: data.secret, active: data.active } });
      }
      case 'update_outbound': {
        const { id, url, secret, active } = body;
        const updates: any = {};
        if (url !== undefined) updates.url = url;
        if (secret !== undefined) updates.secret = secret;
        if (active !== undefined) updates.active = active;
        const data = await prisma.integrationOutboundEndpoint.update({
          where: { id },
          data: updates,
          select: { id: true, name: true, url: true, secret: true, active: true },
        });
        return json({ data: { id: data.id, name: data.name, url: data.url, secret: data.secret, active: data.active } });
      }
      case 'delete_outbound': {
        await prisma.integrationOutboundEndpoint.delete({ where: { id: body.id } });
        return json({ ok: true });
      }
      default:
        return json({ error: 'Unknown action' }, 400);
    }
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
}

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authPublicApi } from '@/lib/public-api/auth';
import { prisma } from '@/lib/db/prisma';
import { isValidUUID, sanitizeUUID } from '@/lib/utils/uuid';
import { normalizeText } from '@/lib/public-api/sanitize';

export const runtime = 'nodejs';

const DealPatchSchema = z.object({
  title: z.string().optional(),
  value: z.number().optional(),
  contact_id: z.string().uuid().optional(),
  client_company_id: z.string().uuid().nullable().optional(),
  loss_reason: z.string().nullable().optional(),
}).strict();

function toSnakeCase(d: any) {
  return {
    id: d.id,
    title: d.title,
    value: Number(d.value ?? 0),
    board_id: d.boardId,
    stage_id: d.stageId,
    contact_id: d.contactId,
    client_company_id: d.clientCompanyId ?? null,
    is_won: !!d.isWon,
    is_lost: !!d.isLost,
    loss_reason: d.lossReason ?? null,
    closed_at: d.closedAt ?? null,
    created_at: d.createdAt,
    updated_at: d.updatedAt,
  };
}

const dealSelect = {
  id: true, title: true, value: true, boardId: true, stageId: true,
  contactId: true, clientCompanyId: true, isWon: true, isLost: true,
  lossReason: true, closedAt: true, createdAt: true, updatedAt: true,
};

export async function GET(request: Request, ctx: { params: Promise<{ dealId: string }> }) {
  const auth = await authPublicApi(request);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const { dealId } = await ctx.params;
  if (!isValidUUID(dealId)) {
    return NextResponse.json({ error: 'Invalid deal id', code: 'VALIDATION_ERROR' }, { status: 422 });
  }

  try {
    const data = await prisma.deal.findFirst({
      where: {
        organizationId: auth.organizationId,
        deletedAt: null,
        id: dealId,
      },
      select: dealSelect,
    });

    if (!data) return NextResponse.json({ error: 'Deal not found', code: 'NOT_FOUND' }, { status: 404 });

    return NextResponse.json({ data: toSnakeCase(data) });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, code: 'DB_ERROR' }, { status: 500 });
  }
}

export async function PATCH(request: Request, ctx: { params: Promise<{ dealId: string }> }) {
  const auth = await authPublicApi(request);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const { dealId } = await ctx.params;
  if (!isValidUUID(dealId)) {
    return NextResponse.json({ error: 'Invalid deal id', code: 'VALIDATION_ERROR' }, { status: 422 });
  }

  const body = await request.json().catch(() => null);
  const parsed = DealPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', code: 'VALIDATION_ERROR' }, { status: 422 });
  }

  const updates: any = {};
  if (parsed.data.title !== undefined) updates.title = normalizeText(parsed.data.title);
  if (parsed.data.value !== undefined) updates.value = Number(parsed.data.value ?? 0);
  if (parsed.data.contact_id !== undefined) updates.contactId = sanitizeUUID(parsed.data.contact_id);
  if (parsed.data.client_company_id !== undefined) updates.clientCompanyId = parsed.data.client_company_id === null ? null : (sanitizeUUID(parsed.data.client_company_id) || null);
  if (parsed.data.loss_reason !== undefined) updates.lossReason = parsed.data.loss_reason === null ? null : normalizeText(parsed.data.loss_reason);

  try {
    const existing = await prisma.deal.findFirst({
      where: { organizationId: auth.organizationId, id: dealId },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: 'Deal not found', code: 'NOT_FOUND' }, { status: 404 });

    const data = await prisma.deal.update({
      where: { id: dealId },
      data: updates,
      select: dealSelect,
    });

    return NextResponse.json({ data: toSnakeCase(data) });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, code: 'DB_ERROR' }, { status: 500 });
  }
}

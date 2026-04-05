import { NextResponse } from 'next/server';
import { authPublicApi } from '@/lib/public-api/auth';
import { prisma } from '@/lib/db/prisma';
import { isValidUUID } from '@/lib/utils/uuid';

export const runtime = 'nodejs';

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

export async function POST(request: Request, ctx: { params: Promise<{ dealId: string }> }) {
  const auth = await authPublicApi(request);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const { dealId } = await ctx.params;
  if (!isValidUUID(dealId)) {
    return NextResponse.json({ error: 'Invalid deal id', code: 'VALIDATION_ERROR' }, { status: 422 });
  }

  try {
    const existing = await prisma.deal.findFirst({
      where: {
        organizationId: auth.organizationId,
        deletedAt: null,
        id: dealId,
      },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: 'Deal not found', code: 'NOT_FOUND' }, { status: 404 });

    const now = new Date();
    const data = await prisma.deal.update({
      where: { id: dealId },
      data: {
        isWon: true,
        isLost: false,
        closedAt: now,
      },
      select: dealSelect,
    });

    return NextResponse.json({ data: toSnakeCase(data), action: 'won' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, code: 'DB_ERROR' }, { status: 500 });
  }
}

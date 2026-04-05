import { prisma } from '@/lib/db/prisma';
import { normalizeEmail, normalizePhone } from '@/lib/public-api/sanitize';
import { resolveBoardId } from '@/lib/public-api/resolve';
import { sanitizeUUID } from '@/lib/utils/uuid';

export type MoveStageTarget =
  | { to_stage_id: string }
  | { to_stage_label: string }
  | { to_stage_id?: string; to_stage_label?: string };

async function resolveStageIdForBoard(opts: {
  organizationId: string;
  boardId: string;
  toStageId?: string | null;
  toStageLabel?: string | null;
}) {
  const idFromBody = sanitizeUUID(opts.toStageId || null);
  const label = (opts.toStageLabel || '').trim();

  if (idFromBody) {
    const stage = await prisma.boardStage.findFirst({
      where: {
        organizationId: opts.organizationId,
        boardId: opts.boardId,
        id: idFromBody,
      },
      select: { id: true },
    });
    return stage?.id ? idFromBody : null;
  }

  if (!label) return null;

  const stages = await prisma.boardStage.findMany({
    where: {
      organizationId: opts.organizationId,
      boardId: opts.boardId,
      label: { equals: label, mode: 'insensitive' },
    },
    select: { id: true, label: true },
    take: 2,
  });
  if (!stages || stages.length === 0) return null;
  if (stages.length > 1) return '__AMBIGUOUS__';
  return stages[0].id;
}

export async function moveStageByDealId(opts: {
  organizationId: string;
  dealId: string;
  target: { to_stage_id?: string | null; to_stage_label?: string | null };
  mark?: 'won' | 'lost' | null;
}) {
  const dealId = sanitizeUUID(opts.dealId);
  if (!dealId) return { ok: false as const, status: 422, body: { error: 'Invalid deal id', code: 'VALIDATION_ERROR' } };

  const deal = await prisma.deal.findFirst({
    where: {
      organizationId: opts.organizationId,
      deletedAt: null,
      id: dealId,
    },
    select: { id: true, boardId: true, stageId: true },
  });
  if (!deal) return { ok: false as const, status: 404, body: { error: 'Deal not found', code: 'NOT_FOUND' } };

  const boardId = deal.boardId as string;
  const boardCfg = await prisma.board.findFirst({
    where: {
      organizationId: opts.organizationId,
      deletedAt: null,
      id: boardId,
    },
    select: { wonStageId: true, lostStageId: true },
  });
  const wonStageId = sanitizeUUID(boardCfg?.wonStageId) || null;
  const lostStageId = sanitizeUUID(boardCfg?.lostStageId) || null;

  const stageId = await resolveStageIdForBoard({
    organizationId: opts.organizationId,
    boardId,
    toStageId: opts.target.to_stage_id ?? null,
    toStageLabel: opts.target.to_stage_label ?? null,
  });

  if (!stageId || stageId === '__AMBIGUOUS__') {
    return {
      ok: false as const,
      status: 422,
      body: {
        error: stageId === '__AMBIGUOUS__' ? 'Ambiguous stage label for this board' : 'Stage not found for this board',
        code: 'VALIDATION_ERROR',
      },
    };
  }

  const now = new Date();
  const updates: any = { stageId, lastStageChangeDate: now };
  if (opts.mark === 'won' || (wonStageId && stageId === wonStageId)) {
    updates.isWon = true;
    updates.isLost = false;
    updates.closedAt = now;
    updates.lossReason = null;
  }
  if (opts.mark === 'lost' || (lostStageId && stageId === lostStageId)) {
    updates.isLost = true;
    updates.isWon = false;
    updates.closedAt = now;
  }

  const dealSelect = {
    id: true, title: true, value: true, boardId: true, stageId: true,
    contactId: true, clientCompanyId: true, isWon: true, isLost: true,
    lossReason: true, closedAt: true, createdAt: true, updatedAt: true,
  };

  const data = await prisma.deal.update({
    where: { id: dealId },
    data: updates,
    select: dealSelect,
  });

  const snakeData = {
    id: data.id,
    title: data.title,
    value: Number(data.value ?? 0),
    board_id: data.boardId,
    stage_id: data.stageId,
    contact_id: data.contactId,
    client_company_id: data.clientCompanyId ?? null,
    is_won: !!data.isWon,
    is_lost: !!data.isLost,
    loss_reason: data.lossReason ?? null,
    closed_at: data.closedAt ?? null,
    created_at: data.createdAt,
    updated_at: data.updatedAt,
  };

  return { ok: true as const, status: 200, body: { data: snakeData, action: 'moved' } };
}

export async function moveStageByIdentity(opts: {
  organizationId: string;
  boardKeyOrId: string;
  phone?: string | null;
  email?: string | null;
  target: { to_stage_id?: string | null; to_stage_label?: string | null };
  mark?: 'won' | 'lost' | null;
}) {
  const boardId = await resolveBoardId({
    organizationId: opts.organizationId,
    boardKeyOrId: opts.boardKeyOrId.trim(),
  });
  if (!boardId) return { ok: false as const, status: 404, body: { error: 'Board not found', code: 'NOT_FOUND' } };

  const phone = normalizePhone(opts.phone);
  const email = normalizeEmail(opts.email);
  if (!phone && !email) return { ok: false as const, status: 422, body: { error: 'Invalid phone/email', code: 'VALIDATION_ERROR' } };

  const boardCfg = await prisma.board.findFirst({
    where: {
      organizationId: opts.organizationId,
      deletedAt: null,
      id: boardId,
    },
    select: { wonStageId: true, lostStageId: true },
  });
  const wonStageId = sanitizeUUID(boardCfg?.wonStageId) || null;
  const lostStageId = sanitizeUUID(boardCfg?.lostStageId) || null;

  const contactWhere: any = {
    organizationId: opts.organizationId,
    deletedAt: null,
  };
  if (phone && email) {
    contactWhere.OR = [{ phone }, { email }];
  } else if (phone) {
    contactWhere.phone = phone;
  } else {
    contactWhere.email = email;
  }

  const contacts = await prisma.contact.findMany({
    where: contactWhere,
    select: { id: true },
    take: 20,
  });
  const contactIds = contacts.map(c => c.id).filter(Boolean);
  if (contactIds.length === 0) return { ok: false as const, status: 404, body: { error: 'Deal not found for this identity', code: 'NOT_FOUND' } };

  const deals = await prisma.deal.findMany({
    where: {
      organizationId: opts.organizationId,
      deletedAt: null,
      boardId,
      isWon: false,
      isLost: false,
      contactId: { in: contactIds },
    },
    select: { id: true },
    orderBy: { updatedAt: 'desc' },
    take: 2,
  });
  if (!deals || deals.length === 0) return { ok: false as const, status: 404, body: { error: 'Deal not found for this identity', code: 'NOT_FOUND' } };
  if (deals.length > 1) {
    return { ok: false as const, status: 409, body: { error: 'More than one open deal found for this identity in this board', code: 'AMBIGUOUS_MATCH' } };
  }

  const dealId = deals[0].id;
  const stageId = await resolveStageIdForBoard({
    organizationId: opts.organizationId,
    boardId,
    toStageId: opts.target.to_stage_id ?? null,
    toStageLabel: opts.target.to_stage_label ?? null,
  });
  if (!stageId || stageId === '__AMBIGUOUS__') {
    return {
      ok: false as const,
      status: 422,
      body: {
        error: stageId === '__AMBIGUOUS__' ? 'Ambiguous stage label for this board' : 'Stage not found for this board',
        code: 'VALIDATION_ERROR',
      },
    };
  }

  const now = new Date();
  const updates: any = { stageId, lastStageChangeDate: now };
  if (opts.mark === 'won' || (wonStageId && stageId === wonStageId)) {
    updates.isWon = true;
    updates.isLost = false;
    updates.closedAt = now;
    updates.lossReason = null;
  }
  if (opts.mark === 'lost' || (lostStageId && stageId === lostStageId)) {
    updates.isLost = true;
    updates.isWon = false;
    updates.closedAt = now;
  }

  const dealSelect = {
    id: true, title: true, value: true, boardId: true, stageId: true,
    contactId: true, clientCompanyId: true, isWon: true, isLost: true,
    lossReason: true, closedAt: true, createdAt: true, updatedAt: true,
  };

  const updated = await prisma.deal.update({
    where: { id: dealId },
    data: updates,
    select: dealSelect,
  });

  const snakeData = {
    id: updated.id,
    title: updated.title,
    value: Number(updated.value ?? 0),
    board_id: updated.boardId,
    stage_id: updated.stageId,
    contact_id: updated.contactId,
    client_company_id: updated.clientCompanyId ?? null,
    is_won: !!updated.isWon,
    is_lost: !!updated.isLost,
    loss_reason: updated.lossReason ?? null,
    closed_at: updated.closedAt ?? null,
    created_at: updated.createdAt,
    updated_at: updated.updatedAt,
  };

  return { ok: true as const, status: 200, body: { data: snakeData, action: 'moved' } };
}

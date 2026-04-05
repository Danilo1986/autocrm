import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authPublicApi } from '@/lib/public-api/auth';
import { prisma } from '@/lib/db/prisma';
import { decodeOffsetCursor, encodeOffsetCursor, parseLimit } from '@/lib/public-api/cursor';
import { resolveBoardIdFromKey, resolveFirstStageId } from '@/lib/public-api/resolve';
import { normalizeEmail, normalizePhone, normalizeText } from '@/lib/public-api/sanitize';
import { isValidUUID, sanitizeUUID } from '@/lib/utils/uuid';

export const runtime = 'nodejs';

const ContactInlineSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  role: z.string().optional(),
  client_company_id: z.string().uuid().optional(),
}).strict();

const DealCreateSchema = z.object({
  title: z.string().min(1),
  value: z.number().optional(),
  board_id: z.string().uuid().optional(),
  board_key: z.string().min(1).optional(),
  stage_id: z.string().uuid().optional(),
  contact_id: z.string().uuid().optional(),
  contact: ContactInlineSchema.optional(),
  client_company_id: z.string().uuid().optional(),
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

export async function GET(request: Request) {
  const auth = await authPublicApi(request);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();
  const boardId = sanitizeUUID(url.searchParams.get('board_id'));
  const boardKey = (url.searchParams.get('board_key') || '').trim();
  const stageId = sanitizeUUID(url.searchParams.get('stage_id'));
  const contactId = sanitizeUUID(url.searchParams.get('contact_id'));
  const clientCompanyId = sanitizeUUID(url.searchParams.get('client_company_id'));
  const status = (url.searchParams.get('status') || '').trim();
  const updatedAfter = (url.searchParams.get('updated_after') || '').trim();
  const limit = parseLimit(url.searchParams.get('limit'));
  const offset = decodeOffsetCursor(url.searchParams.get('cursor'));

  try {
    let resolvedBoardId = boardId;
    if (!resolvedBoardId && boardKey) {
      resolvedBoardId = await resolveBoardIdFromKey({ organizationId: auth.organizationId, boardKey });
    }

    const where: any = {
      organizationId: auth.organizationId,
      deletedAt: null,
    };

    if (resolvedBoardId) where.boardId = resolvedBoardId;
    if (stageId) where.stageId = stageId;
    if (contactId) where.contactId = contactId;
    if (clientCompanyId) where.clientCompanyId = clientCompanyId;
    if (updatedAfter) where.updatedAt = { gte: new Date(updatedAfter) };
    if (q) where.title = { contains: q, mode: 'insensitive' };

    if (status === 'open') { where.isWon = false; where.isLost = false; }
    if (status === 'won') where.isWon = true;
    if (status === 'lost') where.isLost = true;

    const [data, total] = await Promise.all([
      prisma.deal.findMany({
        where,
        select: dealSelect,
        orderBy: { updatedAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.deal.count({ where }),
    ]);

    const nextOffset = offset + limit;
    const nextCursor = nextOffset < total ? encodeOffsetCursor(nextOffset) : null;

    return NextResponse.json({
      data: data.map(toSnakeCase),
      nextCursor,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, code: 'DB_ERROR' }, { status: 500 });
  }
}

async function upsertContactForDeal(opts: {
  organizationId: string;
  contact: z.infer<typeof ContactInlineSchema>;
}) {
  const email = normalizeEmail(opts.contact.email);
  const phone = normalizePhone(opts.contact.phone);
  const name = normalizeText(opts.contact.name);
  if (!email && !phone) {
    throw new Error('Provide contact.email or contact.phone');
  }

  const lookupWhere: any = {
    organizationId: opts.organizationId,
    deletedAt: null,
  };
  if (email && phone) {
    lookupWhere.OR = [{ email }, { phone }];
  } else if (email) {
    lookupWhere.email = email;
  } else {
    lookupWhere.phone = phone;
  }

  const existing = await prisma.contact.findFirst({
    where: lookupWhere,
    select: { id: true },
  });

  const base: any = {
    email,
    phone,
    role: normalizeText(opts.contact.role),
    clientCompanyId: sanitizeUUID(opts.contact.client_company_id) || null,
  };

  if (existing?.id) {
    if (name) base.name = name;
    await prisma.contact.update({ where: { id: existing.id }, data: base });
    return existing.id;
  }

  if (!name) throw new Error('contact.name is required to create a new contact');
  const created = await prisma.contact.create({
    data: {
      ...base,
      organizationId: opts.organizationId,
      name,
      status: 'ACTIVE',
      stage: 'LEAD',
    },
    select: { id: true },
  });
  return created.id;
}

export async function POST(request: Request) {
  const auth = await authPublicApi(request);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const body = await request.json().catch(() => null);
  const parsed = DealCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', code: 'VALIDATION_ERROR' }, { status: 422 });
  }

  try {
    let boardId = sanitizeUUID(parsed.data.board_id);
    if (!boardId && parsed.data.board_key) {
      boardId = await resolveBoardIdFromKey({ organizationId: auth.organizationId, boardKey: parsed.data.board_key });
    }
    if (!boardId) {
      return NextResponse.json({ error: 'Provide board_id or board_key', code: 'VALIDATION_ERROR' }, { status: 422 });
    }

    let stageId = sanitizeUUID(parsed.data.stage_id);
    if (!stageId) {
      stageId = await resolveFirstStageId({ organizationId: auth.organizationId, boardId });
    }
    if (!stageId) {
      return NextResponse.json({ error: 'No stages found for board', code: 'VALIDATION_ERROR' }, { status: 422 });
    }

    let contactId = sanitizeUUID(parsed.data.contact_id);
    if (!contactId && parsed.data.contact) {
      try {
        contactId = await upsertContactForDeal({ organizationId: auth.organizationId, contact: parsed.data.contact });
      } catch (e: any) {
        return NextResponse.json({ error: e?.message || 'Invalid contact', code: 'VALIDATION_ERROR' }, { status: 422 });
      }
    }
    if (!contactId) {
      return NextResponse.json({ error: 'Provide contact_id or contact', code: 'VALIDATION_ERROR' }, { status: 422 });
    }

    const value = Number(parsed.data.value ?? 0);
    const data = await prisma.deal.create({
      data: {
        organizationId: auth.organizationId,
        title: parsed.data.title.trim(),
        value,
        boardId,
        stageId,
        contactId,
        clientCompanyId: sanitizeUUID(parsed.data.client_company_id) || null,
        isWon: false,
        isLost: false,
      },
      select: dealSelect,
    });

    return NextResponse.json({ data: toSnakeCase(data), action: 'created' }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, code: 'DB_ERROR' }, { status: 500 });
  }
}

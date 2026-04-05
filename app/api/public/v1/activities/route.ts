import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authPublicApi } from '@/lib/public-api/auth';
import { prisma } from '@/lib/db/prisma';
import { decodeOffsetCursor, encodeOffsetCursor, parseLimit } from '@/lib/public-api/cursor';
import { sanitizeUUID } from '@/lib/utils/uuid';
import { normalizeText } from '@/lib/public-api/sanitize';

export const runtime = 'nodejs';

const ActivityCreateSchema = z.object({
  type: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  date: z.string().optional(), // ISO
  deal_id: z.string().uuid().optional(),
  contact_id: z.string().uuid().optional(),
  client_company_id: z.string().uuid().optional(),
}).strict();

function toSnakeCase(a: any) {
  return {
    id: a.id,
    title: a.title,
    description: a.description ?? null,
    type: a.type,
    date: a.date,
    completed: !!a.completed,
    deal_id: a.dealId ?? null,
    contact_id: a.contactId ?? null,
    client_company_id: a.clientCompanyId ?? null,
    created_at: a.createdAt,
  };
}

const activitySelect = {
  id: true, title: true, description: true, type: true, date: true,
  completed: true, dealId: true, contactId: true, clientCompanyId: true,
  createdAt: true,
};

export async function GET(request: Request) {
  const auth = await authPublicApi(request);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const url = new URL(request.url);
  const dealId = sanitizeUUID(url.searchParams.get('deal_id'));
  const contactId = sanitizeUUID(url.searchParams.get('contact_id'));
  const clientCompanyId = sanitizeUUID(url.searchParams.get('client_company_id'));
  const type = (url.searchParams.get('type') || '').trim();
  const limit = parseLimit(url.searchParams.get('limit'));
  const offset = decodeOffsetCursor(url.searchParams.get('cursor'));

  try {
    const where: any = {
      organizationId: auth.organizationId,
      deletedAt: null,
    };

    if (dealId) where.dealId = dealId;
    if (contactId) where.contactId = contactId;
    if (clientCompanyId) where.clientCompanyId = clientCompanyId;
    if (type) where.type = type;

    const [data, total] = await Promise.all([
      prisma.activity.findMany({
        where,
        select: activitySelect,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: offset,
        take: limit,
      }),
      prisma.activity.count({ where }),
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

export async function POST(request: Request) {
  const auth = await authPublicApi(request);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const body = await request.json().catch(() => null);
  const parsed = ActivityCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', code: 'VALIDATION_ERROR' }, { status: 422 });
  }

  const now = new Date();
  const date = parsed.data.date ? new Date(parsed.data.date) : now;
  if (Number.isNaN(date.getTime())) {
    return NextResponse.json({ error: 'Invalid date', code: 'VALIDATION_ERROR' }, { status: 422 });
  }

  try {
    const data = await prisma.activity.create({
      data: {
        organizationId: auth.organizationId,
        title: normalizeText(parsed.data.title) || parsed.data.title,
        description: normalizeText(parsed.data.description),
        type: normalizeText(parsed.data.type) || parsed.data.type,
        date,
        completed: false,
        dealId: sanitizeUUID(parsed.data.deal_id) || null,
        contactId: sanitizeUUID(parsed.data.contact_id) || null,
        clientCompanyId: sanitizeUUID(parsed.data.client_company_id) || null,
      },
      select: activitySelect,
    });
    return NextResponse.json({ data: toSnakeCase(data), action: 'created' }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, code: 'DB_ERROR' }, { status: 500 });
  }
}

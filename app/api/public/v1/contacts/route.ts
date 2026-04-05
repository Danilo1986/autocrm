import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authPublicApi } from '@/lib/public-api/auth';
import { prisma } from '@/lib/db/prisma';
import { decodeOffsetCursor, encodeOffsetCursor, parseLimit } from '@/lib/public-api/cursor';
import { normalizeEmail, normalizePhone, normalizeText } from '@/lib/public-api/sanitize';
import { sanitizeUUID } from '@/lib/utils/uuid';

export const runtime = 'nodejs';

const ContactUpsertSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  role: z.string().optional(),
  company_name: z.string().optional(),
  client_company_id: z.string().uuid().optional(),
  avatar: z.string().optional(),
  status: z.string().optional(),
  stage: z.string().optional(),
  birth_date: z.string().optional(), // YYYY-MM-DD
  last_interaction: z.string().optional(), // ISO
  last_purchase_date: z.string().optional(), // YYYY-MM-DD
  total_value: z.number().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
}).strict();

function toIsoDateString(v: string | undefined) {
  const s = (v || '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '__INVALID__';
  return d.toISOString().slice(0, 10);
}

function toIsoTimestamp(v: string | undefined) {
  const s = (v || '').trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '__INVALID__';
  return d.toISOString();
}

function toSnakeCase(c: any) {
  return {
    id: c.id,
    name: c.name,
    email: c.email ?? null,
    phone: c.phone ?? null,
    role: c.role ?? null,
    company_name: c.companyName ?? null,
    client_company_id: c.clientCompanyId ?? null,
    avatar: c.avatar ?? null,
    status: c.status ?? null,
    stage: c.stage ?? null,
    source: c.source ?? null,
    notes: c.notes ?? null,
    birth_date: c.birthDate ?? null,
    last_interaction: c.lastInteraction ?? null,
    last_purchase_date: c.lastPurchaseDate ?? null,
    total_value: c.totalValue != null ? Number(c.totalValue) : null,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  };
}

async function resolveCompanyIdFromName(opts: { organizationId: string; companyName: string }) {
  const name = normalizeText(opts.companyName);
  if (!name) return null;

  const existing = await prisma.crmCompany.findFirst({
    where: {
      organizationId: opts.organizationId,
      deletedAt: null,
      name: { equals: name, mode: 'insensitive' },
    },
    select: { id: true },
  });
  if (existing?.id) return existing.id;

  const created = await prisma.crmCompany.create({
    data: {
      organizationId: opts.organizationId,
      name,
    },
    select: { id: true },
  });
  return created.id;
}

const contactSelect = {
  id: true, name: true, email: true, phone: true, role: true,
  companyName: true, clientCompanyId: true, avatar: true, notes: true,
  status: true, stage: true, source: true, birthDate: true,
  lastInteraction: true, lastPurchaseDate: true, totalValue: true,
  createdAt: true, updatedAt: true,
};

export async function GET(request: Request) {
  const auth = await authPublicApi(request);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();
  const email = normalizeEmail(url.searchParams.get('email'));
  const phone = normalizePhone(url.searchParams.get('phone'));
  const clientCompanyId = sanitizeUUID(url.searchParams.get('client_company_id'));
  const limit = parseLimit(url.searchParams.get('limit'));
  const offset = decodeOffsetCursor(url.searchParams.get('cursor'));

  try {
    const where: any = {
      organizationId: auth.organizationId,
      deletedAt: null,
    };

    if (clientCompanyId) where.clientCompanyId = clientCompanyId;
    if (email) where.email = email;
    if (phone) where.phone = phone;
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        select: contactSelect,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.contact.count({ where }),
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
  const parsed = ContactUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', code: 'VALIDATION_ERROR' }, { status: 422 });
  }

  const email = normalizeEmail(parsed.data.email);
  const phone = normalizePhone(parsed.data.phone);
  const name = normalizeText(parsed.data.name);
  const companyName = normalizeText(parsed.data.company_name);

  if (!email && !phone) {
    return NextResponse.json({ error: 'Provide email or phone', code: 'VALIDATION_ERROR' }, { status: 422 });
  }

  const birthDate = toIsoDateString(parsed.data.birth_date);
  if (birthDate === '__INVALID__') return NextResponse.json({ error: 'Invalid birth_date', code: 'VALIDATION_ERROR' }, { status: 422 });
  const lastPurchaseDate = toIsoDateString(parsed.data.last_purchase_date);
  if (lastPurchaseDate === '__INVALID__') return NextResponse.json({ error: 'Invalid last_purchase_date', code: 'VALIDATION_ERROR' }, { status: 422 });
  const lastInteraction = toIsoTimestamp(parsed.data.last_interaction);
  if (lastInteraction === '__INVALID__') return NextResponse.json({ error: 'Invalid last_interaction', code: 'VALIDATION_ERROR' }, { status: 422 });

  let clientCompanyId = sanitizeUUID(parsed.data.client_company_id) || null;
  if (!clientCompanyId && companyName) {
    try {
      clientCompanyId = await resolveCompanyIdFromName({ organizationId: auth.organizationId, companyName });
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || 'Invalid company', code: 'VALIDATION_ERROR' }, { status: 422 });
    }
  }

  try {
    // Lookup existing contact
    const lookupWhere: any = {
      organizationId: auth.organizationId,
      deletedAt: null,
    };
    if (email && phone) {
      lookupWhere.OR = [{ email }, { phone }];
    } else if (email) {
      lookupWhere.email = email;
    } else if (phone) {
      lookupWhere.phone = phone;
    }

    const existing = await prisma.contact.findFirst({
      where: lookupWhere,
      select: { id: true },
    });

    const baseData: any = {
      email,
      phone,
      role: normalizeText(parsed.data.role),
      companyName,
      clientCompanyId,
      avatar: normalizeText(parsed.data.avatar),
      status: normalizeText(parsed.data.status),
      stage: normalizeText(parsed.data.stage),
      source: normalizeText(parsed.data.source),
      notes: normalizeText(parsed.data.notes),
      birthDate: birthDate ? new Date(birthDate) : undefined,
      lastInteraction: lastInteraction ? new Date(lastInteraction) : undefined,
      lastPurchaseDate: lastPurchaseDate ? new Date(lastPurchaseDate) : undefined,
      totalValue: parsed.data.total_value ?? undefined,
    };

    if (existing?.id) {
      if (name) baseData.name = name;
      const data = await prisma.contact.update({
        where: { id: existing.id },
        data: baseData,
        select: contactSelect,
      });
      return NextResponse.json({ data: toSnakeCase(data), action: 'updated' });
    }

    if (!name) {
      return NextResponse.json({ error: 'Name is required to create a new contact', code: 'VALIDATION_ERROR' }, { status: 422 });
    }

    const data = await prisma.contact.create({
      data: {
        ...baseData,
        organizationId: auth.organizationId,
        name,
        status: 'ACTIVE',
        stage: 'LEAD',
      },
      select: contactSelect,
    });
    return NextResponse.json({ data: toSnakeCase(data), action: 'created' }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, code: 'DB_ERROR' }, { status: 500 });
  }
}

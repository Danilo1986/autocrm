import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authPublicApi } from '@/lib/public-api/auth';
import { prisma } from '@/lib/db/prisma';
import { isValidUUID, sanitizeUUID } from '@/lib/utils/uuid';
import { normalizeEmail, normalizePhone, normalizeText } from '@/lib/public-api/sanitize';

export const runtime = 'nodejs';

const ContactPatchSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  role: z.string().optional(),
  company_name: z.string().optional(),
  client_company_id: z.string().uuid().nullable().optional(),
  avatar: z.string().optional(),
  status: z.string().optional(),
  stage: z.string().optional(),
  birth_date: z.string().nullable().optional(),
  last_interaction: z.string().nullable().optional(),
  last_purchase_date: z.string().nullable().optional(),
  total_value: z.number().nullable().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
}).strict();

function toIsoDateString(v: string | undefined | null) {
  const s = (v || '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '__INVALID__';
  return d.toISOString().slice(0, 10);
}

function toIsoTimestamp(v: string | undefined | null) {
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

const contactSelect = {
  id: true, name: true, email: true, phone: true, role: true,
  companyName: true, clientCompanyId: true, avatar: true, notes: true,
  status: true, stage: true, source: true, birthDate: true,
  lastInteraction: true, lastPurchaseDate: true, totalValue: true,
  createdAt: true, updatedAt: true,
};

export async function GET(request: Request, ctx: { params: Promise<{ contactId: string }> }) {
  const auth = await authPublicApi(request);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const { contactId } = await ctx.params;
  if (!isValidUUID(contactId)) {
    return NextResponse.json({ error: 'Invalid contact id', code: 'VALIDATION_ERROR' }, { status: 422 });
  }

  try {
    const data = await prisma.contact.findFirst({
      where: {
        organizationId: auth.organizationId,
        deletedAt: null,
        id: contactId,
      },
      select: contactSelect,
    });

    if (!data) return NextResponse.json({ error: 'Contact not found', code: 'NOT_FOUND' }, { status: 404 });

    return NextResponse.json({ data: toSnakeCase(data) });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, code: 'DB_ERROR' }, { status: 500 });
  }
}

export async function PATCH(request: Request, ctx: { params: Promise<{ contactId: string }> }) {
  const auth = await authPublicApi(request);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const { contactId } = await ctx.params;
  if (!isValidUUID(contactId)) {
    return NextResponse.json({ error: 'Invalid contact id', code: 'VALIDATION_ERROR' }, { status: 422 });
  }

  const body = await request.json().catch(() => null);
  const parsed = ContactPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', code: 'VALIDATION_ERROR' }, { status: 422 });
  }

  const updates: any = {};
  if (parsed.data.name !== undefined) updates.name = normalizeText(parsed.data.name);
  if (parsed.data.email !== undefined) updates.email = normalizeEmail(parsed.data.email);
  if (parsed.data.phone !== undefined) updates.phone = normalizePhone(parsed.data.phone);
  if (parsed.data.role !== undefined) updates.role = normalizeText(parsed.data.role);
  if (parsed.data.company_name !== undefined) updates.companyName = normalizeText(parsed.data.company_name);
  if (parsed.data.avatar !== undefined) updates.avatar = normalizeText(parsed.data.avatar);
  if (parsed.data.status !== undefined) updates.status = normalizeText(parsed.data.status);
  if (parsed.data.stage !== undefined) updates.stage = normalizeText(parsed.data.stage);
  if (parsed.data.source !== undefined) updates.source = normalizeText(parsed.data.source);
  if (parsed.data.notes !== undefined) updates.notes = normalizeText(parsed.data.notes);
  if (parsed.data.client_company_id !== undefined) {
    updates.clientCompanyId = parsed.data.client_company_id === null ? null : (sanitizeUUID(parsed.data.client_company_id) || null);
  }
  if (parsed.data.birth_date !== undefined) {
    const bd = parsed.data.birth_date === null ? null : toIsoDateString(parsed.data.birth_date);
    if (bd === '__INVALID__') {
      return NextResponse.json({ error: 'Invalid birth_date', code: 'VALIDATION_ERROR' }, { status: 422 });
    }
    updates.birthDate = bd ? new Date(bd) : null;
  }
  if (parsed.data.last_purchase_date !== undefined) {
    const lpd = parsed.data.last_purchase_date === null ? null : toIsoDateString(parsed.data.last_purchase_date);
    if (lpd === '__INVALID__') {
      return NextResponse.json({ error: 'Invalid last_purchase_date', code: 'VALIDATION_ERROR' }, { status: 422 });
    }
    updates.lastPurchaseDate = lpd ? new Date(lpd) : null;
  }
  if (parsed.data.last_interaction !== undefined) {
    const li = parsed.data.last_interaction === null ? null : toIsoTimestamp(parsed.data.last_interaction);
    if (li === '__INVALID__') {
      return NextResponse.json({ error: 'Invalid last_interaction', code: 'VALIDATION_ERROR' }, { status: 422 });
    }
    updates.lastInteraction = li ? new Date(li) : null;
  }
  if (parsed.data.total_value !== undefined) {
    updates.totalValue = parsed.data.total_value === null ? 0 : Number(parsed.data.total_value);
  }

  try {
    const existing = await prisma.contact.findFirst({
      where: { organizationId: auth.organizationId, deletedAt: null, id: contactId },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: 'Contact not found', code: 'NOT_FOUND' }, { status: 404 });

    const data = await prisma.contact.update({
      where: { id: contactId },
      data: updates,
      select: contactSelect,
    });

    return NextResponse.json({ data: toSnakeCase(data) });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, code: 'DB_ERROR' }, { status: 500 });
  }
}

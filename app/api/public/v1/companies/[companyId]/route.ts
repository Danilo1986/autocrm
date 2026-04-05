import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authPublicApi } from '@/lib/public-api/auth';
import { prisma } from '@/lib/db/prisma';
import { isValidUUID } from '@/lib/utils/uuid';
import { normalizeText, normalizeUrl } from '@/lib/public-api/sanitize';

export const runtime = 'nodejs';

const CompanyPatchSchema = z.object({
  name: z.string().optional(),
  website: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
}).strict();

function toSnakeCase(c: any) {
  return {
    id: c.id,
    name: c.name,
    website: c.website ?? null,
    industry: c.industry ?? null,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  };
}

export async function GET(request: Request, ctx: { params: Promise<{ companyId: string }> }) {
  const auth = await authPublicApi(request);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const { companyId } = await ctx.params;
  if (!isValidUUID(companyId)) {
    return NextResponse.json({ error: 'Invalid company id', code: 'VALIDATION_ERROR' }, { status: 422 });
  }

  try {
    const data = await prisma.crmCompany.findFirst({
      where: {
        organizationId: auth.organizationId,
        id: companyId,
      },
      select: { id: true, name: true, website: true, industry: true, createdAt: true, updatedAt: true },
    });

    if (!data) return NextResponse.json({ error: 'Company not found', code: 'NOT_FOUND' }, { status: 404 });

    return NextResponse.json({ data: toSnakeCase(data) });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, code: 'DB_ERROR' }, { status: 500 });
  }
}

export async function PATCH(request: Request, ctx: { params: Promise<{ companyId: string }> }) {
  const auth = await authPublicApi(request);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const { companyId } = await ctx.params;
  if (!isValidUUID(companyId)) {
    return NextResponse.json({ error: 'Invalid company id', code: 'VALIDATION_ERROR' }, { status: 422 });
  }

  const body = await request.json().catch(() => null);
  const parsed = CompanyPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', code: 'VALIDATION_ERROR' }, { status: 422 });
  }

  const updates: any = {};
  if (parsed.data.name !== undefined) updates.name = normalizeText(parsed.data.name);
  if (parsed.data.website !== undefined) updates.website = parsed.data.website === null ? null : normalizeUrl(parsed.data.website);
  if (parsed.data.industry !== undefined) updates.industry = parsed.data.industry === null ? null : normalizeText(parsed.data.industry);

  try {
    // Check existence first since we need org-scoped update
    const existing = await prisma.crmCompany.findFirst({
      where: { organizationId: auth.organizationId, id: companyId },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: 'Company not found', code: 'NOT_FOUND' }, { status: 404 });

    const data = await prisma.crmCompany.update({
      where: { id: companyId },
      data: updates,
      select: { id: true, name: true, website: true, industry: true, createdAt: true, updatedAt: true },
    });

    return NextResponse.json({ data: toSnakeCase(data) });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, code: 'DB_ERROR' }, { status: 500 });
  }
}

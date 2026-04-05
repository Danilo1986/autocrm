import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authPublicApi } from '@/lib/public-api/auth';
import { prisma } from '@/lib/db/prisma';
import { decodeOffsetCursor, encodeOffsetCursor, parseLimit } from '@/lib/public-api/cursor';
import { normalizeText, normalizeUrl } from '@/lib/public-api/sanitize';

export const runtime = 'nodejs';

const CompanyUpsertSchema = z.object({
  name: z.string().optional(),
  website: z.string().optional(),
  industry: z.string().optional(),
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

export async function GET(request: Request) {
  const auth = await authPublicApi(request);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();
  const name = normalizeText(url.searchParams.get('name'));
  const website = normalizeUrl(url.searchParams.get('website'));
  const limit = parseLimit(url.searchParams.get('limit'));
  const offset = decodeOffsetCursor(url.searchParams.get('cursor'));

  try {
    const where: any = {
      organizationId: auth.organizationId,
    };

    if (website) where.website = website;
    if (name) where.name = { equals: name, mode: 'insensitive' };
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { website: { contains: q, mode: 'insensitive' } },
      ];
    }

    const select = { id: true, name: true, website: true, industry: true, createdAt: true, updatedAt: true };

    const [data, total] = await Promise.all([
      prisma.crmCompany.findMany({
        where,
        select,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.crmCompany.count({ where }),
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
  const parsed = CompanyUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', code: 'VALIDATION_ERROR' }, { status: 422 });
  }

  const name = normalizeText(parsed.data.name);
  const website = normalizeUrl(parsed.data.website);
  const industry = normalizeText(parsed.data.industry);

  if (!website && !name) {
    return NextResponse.json({ error: 'Provide website or name', code: 'VALIDATION_ERROR' }, { status: 422 });
  }

  try {
    const select = { id: true, name: true, website: true, industry: true, createdAt: true, updatedAt: true };

    const lookupWhere: any = {
      organizationId: auth.organizationId,
    };
    if (website) {
      lookupWhere.website = website;
    } else if (name) {
      lookupWhere.name = { equals: name, mode: 'insensitive' };
    }

    const existing = await prisma.crmCompany.findFirst({ where: lookupWhere, select: { id: true } });

    if (existing?.id) {
      const updateData: any = {
        website,
        industry,
      };
      if (name) updateData.name = name;

      const data = await prisma.crmCompany.update({
        where: { id: existing.id },
        data: updateData,
        select,
      });
      return NextResponse.json({ data: toSnakeCase(data), action: 'updated' });
    }

    if (!name) {
      return NextResponse.json({ error: 'Name is required to create a new company', code: 'VALIDATION_ERROR' }, { status: 422 });
    }

    const data = await prisma.crmCompany.create({
      data: {
        organizationId: auth.organizationId,
        name,
        website,
        industry,
      },
      select,
    });
    return NextResponse.json({ data: toSnakeCase(data), action: 'created' }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, code: 'DB_ERROR' }, { status: 500 });
  }
}

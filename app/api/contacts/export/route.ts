import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth/auth';
import { stringifyCsv, withUtf8Bom, type CsvDelimiter } from '@/lib/utils/csv';

type SortBy = 'name' | 'created_at' | 'updated_at' | 'stage';
type SortOrder = 'asc' | 'desc';

function getParam(searchParams: URLSearchParams, key: string): string | undefined {
  const v = searchParams.get(key);
  return v && v.trim() ? v.trim() : undefined;
}

function parseSortBy(v: string | undefined): SortBy {
  if (v === 'name' || v === 'created_at' || v === 'updated_at' || v === 'stage') return v;
  return 'created_at';
}

function parseSortOrder(v: string | undefined): SortOrder {
  return v === 'asc' ? 'asc' : 'desc';
}

// Map snake_case sortBy to Prisma camelCase field
function prismaOrderBy(sortBy: SortBy): string {
  if (sortBy === 'created_at') return 'createdAt';
  if (sortBy === 'updated_at') return 'updatedAt';
  return sortBy;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sp = url.searchParams;

    const search = getParam(sp, 'search');
    const stage = getParam(sp, 'stage');
    const status = getParam(sp, 'status');
    const dateStart = getParam(sp, 'dateStart');
    const dateEnd = getParam(sp, 'dateEnd');
    const delimiter = (getParam(sp, 'delimiter') as CsvDelimiter | undefined) || undefined;
    const sortBy = parseSortBy(getParam(sp, 'sortBy'));
    const sortOrder = parseSortOrder(getParam(sp, 'sortOrder'));

    const session = await auth();
    const userId = session?.user?.id;
    let organizationId: string | null = null;
    if (userId) {
      const profile = await prisma.profile.findUnique({
        where: { id: userId },
        select: { organizationId: true },
      });
      organizationId = profile?.organizationId ?? null;
    }

    const where: any = { deletedAt: null };
    if (organizationId) where.organizationId = organizationId;

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (stage && stage !== 'ALL') where.stage = stage;
    if (status && status !== 'ALL') {
      if (status === 'RISK') {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        where.status = 'ACTIVE';
        where.lastPurchaseDate = { lt: thirtyDaysAgo };
      } else {
        where.status = status;
      }
    }
    if (dateStart) where.createdAt = { ...(where.createdAt || {}), gte: new Date(dateStart) };
    if (dateEnd) where.createdAt = { ...(where.createdAt || {}), lte: new Date(dateEnd) };

    const allContacts = await prisma.contact.findMany({
      where,
      select: {
        id: true, name: true, email: true, phone: true, role: true,
        notes: true, status: true, stage: true, createdAt: true,
        updatedAt: true, clientCompanyId: true, lastPurchaseDate: true,
      },
      orderBy: { [prismaOrderBy(sortBy)]: sortOrder },
    });

    // Company name mapping
    const companyIds = Array.from(
      new Set(allContacts.map(c => c.clientCompanyId).filter(Boolean))
    ) as string[];

    const companyNameById = new Map<string, string>();
    if (companyIds.length) {
      const companies = await prisma.crmCompany.findMany({
        where: { id: { in: companyIds }, deletedAt: null },
        select: { id: true, name: true },
      });
      for (const c of companies) {
        companyNameById.set(c.id, c.name || '');
      }
    }

    const header = [
      'name', 'email', 'phone', 'role', 'company',
      'status', 'stage', 'notes', 'created_at', 'updated_at',
    ];

    const dataRows = allContacts.map(c => [
      c.name || '',
      c.email || '',
      c.phone || '',
      c.role || '',
      companyNameById.get(c.clientCompanyId || '') || '',
      c.status || '',
      c.stage || '',
      c.notes || '',
      c.createdAt?.toISOString() || '',
      c.updatedAt?.toISOString() || '',
    ]);

    const d: CsvDelimiter = delimiter === ';' || delimiter === '\t' || delimiter === ',' ? delimiter : ',';
    const csv = withUtf8Bom(stringifyCsv([header, ...dataRows], d));

    const today = new Date().toISOString().slice(0, 10);
    const filename = `contatos-${today}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error)?.message || 'Erro inesperado' },
      { status: 500 }
    );
  }
}

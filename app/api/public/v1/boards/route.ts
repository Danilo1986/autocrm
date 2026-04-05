import { NextResponse } from 'next/server';
import { authPublicApi } from '@/lib/public-api/auth';
import { prisma } from '@/lib/db/prisma';
import { decodeOffsetCursor, encodeOffsetCursor, parseLimit } from '@/lib/public-api/cursor';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = await authPublicApi(request);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();
  const key = (url.searchParams.get('key') || '').trim();
  const limit = parseLimit(url.searchParams.get('limit'));
  const offset = decodeOffsetCursor(url.searchParams.get('cursor'));

  try {
    const where: any = {
      organizationId: auth.organizationId,
    };

    if (key) where.key = key;
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { key: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.board.findMany({
        where,
        select: { id: true, key: true, name: true, description: true, position: true, isDefault: true, createdAt: true, updatedAt: true },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        skip: offset,
        take: limit,
      }),
      prisma.board.count({ where }),
    ]);

    const nextOffset = offset + limit;
    const nextCursor = nextOffset < total ? encodeOffsetCursor(nextOffset) : null;

    return NextResponse.json({
      data: data.map((b) => ({
        id: b.id,
        key: b.key ?? null,
        name: b.name,
        description: b.description ?? null,
        position: b.position ?? 0,
        is_default: !!b.isDefault,
      })),
      nextCursor,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, code: 'DB_ERROR' }, { status: 500 });
  }
}

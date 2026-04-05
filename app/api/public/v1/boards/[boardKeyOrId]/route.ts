import { NextResponse } from 'next/server';
import { authPublicApi } from '@/lib/public-api/auth';
import { prisma } from '@/lib/db/prisma';
import { isValidUUID } from '@/lib/utils/uuid';

export const runtime = 'nodejs';

export async function GET(request: Request, ctx: { params: Promise<{ boardKeyOrId: string }> }) {
  const auth = await authPublicApi(request);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const { boardKeyOrId } = await ctx.params;
  const value = String(boardKeyOrId || '').trim();
  if (!value) return NextResponse.json({ error: 'Missing board identifier', code: 'BAD_REQUEST' }, { status: 400 });

  try {
    const where: any = {
      organizationId: auth.organizationId,
    };
    if (isValidUUID(value)) {
      where.id = value;
    } else {
      where.key = value;
    }

    const data = await prisma.board.findFirst({
      where,
      select: { id: true, key: true, name: true, description: true, position: true, isDefault: true, createdAt: true, updatedAt: true },
    });

    if (!data) return NextResponse.json({ error: 'Board not found', code: 'NOT_FOUND' }, { status: 404 });

    return NextResponse.json({
      data: {
        id: data.id,
        key: data.key ?? null,
        name: data.name,
        description: data.description ?? null,
        position: data.position ?? 0,
        is_default: !!data.isDefault,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, code: 'DB_ERROR' }, { status: 500 });
  }
}

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
    const boardWhere: any = {
      organizationId: auth.organizationId,
    };
    if (isValidUUID(value)) {
      boardWhere.id = value;
    } else {
      boardWhere.key = value;
    }

    const board = await prisma.board.findFirst({
      where: boardWhere,
      select: { id: true },
    });

    if (!board?.id) return NextResponse.json({ error: 'Board not found', code: 'NOT_FOUND' }, { status: 404 });

    const data = await prisma.boardStage.findMany({
      where: {
        organizationId: auth.organizationId,
        boardId: board.id,
      },
      select: { id: true, label: true, name: true, color: true, order: true },
      orderBy: { order: 'asc' },
    });

    return NextResponse.json({
      data: data.map((s) => ({
        id: s.id,
        label: s.label || s.name,
        color: s.color ?? null,
        order: s.order ?? 0,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, code: 'DB_ERROR' }, { status: 500 });
  }
}

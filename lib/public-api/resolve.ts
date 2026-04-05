import { prisma } from '@/lib/db/prisma';
import { isValidUUID, sanitizeUUID } from '@/lib/utils/uuid';

export async function resolveBoardId(opts: { organizationId: string; boardKeyOrId: string }) {
  const value = opts.boardKeyOrId.trim();
  const where: any = {
    organizationId: opts.organizationId,
  };
  if (isValidUUID(value)) {
    where.id = value;
  } else {
    where.key = value;
  }

  const data = await prisma.board.findFirst({
    where,
    select: { id: true },
  });
  const id = sanitizeUUID(data?.id);
  return id || null;
}

export async function resolveBoardIdFromKey(opts: { organizationId: string; boardKey: string }) {
  return resolveBoardId({ organizationId: opts.organizationId, boardKeyOrId: opts.boardKey });
}

export async function resolveFirstStageId(opts: { organizationId: string; boardId: string }) {
  const data = await prisma.boardStage.findFirst({
    where: {
      organizationId: opts.organizationId,
      boardId: opts.boardId,
    },
    select: { id: true },
    orderBy: { order: 'asc' },
  });
  return sanitizeUUID(data?.id) || null;
}

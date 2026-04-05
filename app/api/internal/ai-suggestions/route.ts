import { prisma } from '@/lib/db/prisma'
import { auth } from '@/lib/auth/auth'
import { NextRequest } from 'next/server'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const data = await prisma.aiSuggestionInteraction.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
    })
    return Response.json({ data, error: null })
  } catch (error) {
    return Response.json({ data: null, error: (error as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { suggestionType, entityType, entityId, action, snoozedUntil } = await req.json()

    if (!suggestionType || !entityType || !entityId || !action) {
      return Response.json({ error: 'suggestionType, entityType, entityId, and action are required' }, { status: 400 })
    }

    const data = await prisma.aiSuggestionInteraction.upsert({
      where: {
        userId_suggestionType_entityId: {
          userId: session.user.id,
          suggestionType,
          entityId,
        },
      },
      update: {
        action,
        snoozedUntil: snoozedUntil ? new Date(snoozedUntil) : null,
        entityType,
      },
      create: {
        userId: session.user.id,
        suggestionType,
        entityType,
        entityId,
        action,
        snoozedUntil: snoozedUntil ? new Date(snoozedUntil) : undefined,
      },
    })
    return Response.json({ data, error: null })
  } catch (error) {
    return Response.json({ data: null, error: (error as Error).message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { suggestionType, entityId } = await req.json()

    if (!suggestionType || !entityId) {
      return Response.json({ error: 'suggestionType and entityId are required' }, { status: 400 })
    }

    await prisma.aiSuggestionInteraction.deleteMany({
      where: {
        userId: session.user.id,
        suggestionType,
        entityId,
        action: 'SNOOZED',
      },
    })
    return Response.json({ error: null })
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}

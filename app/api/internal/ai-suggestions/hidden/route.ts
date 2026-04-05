import { prisma } from '@/lib/db/prisma'
import { auth } from '@/lib/auth/auth'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const interactions = await prisma.aiSuggestionInteraction.findMany({
      where: {
        userId: session.user.id,
        OR: [
          { action: { not: 'SNOOZED' } },
          { action: 'SNOOZED', snoozedUntil: { gt: new Date() } },
        ],
      },
      select: { suggestionType: true, entityId: true },
    })

    const ids = interactions.map((i) => `${i.suggestionType}-${i.entityId}`)
    return Response.json({ data: ids, error: null })
  } catch (error) {
    return Response.json({ data: [], error: (error as Error).message }, { status: 500 })
  }
}

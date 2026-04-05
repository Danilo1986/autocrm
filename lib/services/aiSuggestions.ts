import { prisma } from '@/lib/db/prisma'

export type SuggestionAction = 'ACCEPTED' | 'DISMISSED' | 'SNOOZED'
export type SuggestionType = 'UPSELL' | 'STALLED' | 'BIRTHDAY' | 'RESCUE'

export const aiSuggestionsService = {
  async getAll(userId: string) {
    try {
      const data = await prisma.aiSuggestionInteraction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      })
      return { data, error: null }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  },

  async getInteraction(userId: string, suggestionType: SuggestionType, entityId: string) {
    try {
      const data = await prisma.aiSuggestionInteraction.findUnique({
        where: {
          userId_suggestionType_entityId: { userId, suggestionType, entityId },
        },
      })
      return { data, error: null }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  },

  async recordInteraction(
    userId: string,
    suggestionType: SuggestionType,
    entityType: 'deal' | 'contact',
    entityId: string,
    action: SuggestionAction,
    snoozedUntil?: Date
  ) {
    try {
      const data = await prisma.aiSuggestionInteraction.upsert({
        where: {
          userId_suggestionType_entityId: { userId, suggestionType, entityId },
        },
        update: { action, snoozedUntil: snoozedUntil ?? null, entityType },
        create: { userId, suggestionType, entityType, entityId, action, snoozedUntil },
      })
      return { data, error: null }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  },

  async getHiddenSuggestionIds(userId: string) {
    try {
      const interactions = await prisma.aiSuggestionInteraction.findMany({
        where: {
          userId,
          OR: [
            { action: { not: 'SNOOZED' } },
            { action: 'SNOOZED', snoozedUntil: { gt: new Date() } },
          ],
        },
        select: { suggestionType: true, entityId: true },
      })

      const ids = new Set(interactions.map((i) => `${i.suggestionType}-${i.entityId}`))
      return { data: ids, error: null }
    } catch (error) {
      return { data: new Set<string>(), error: error as Error }
    }
  },

  async clearSnooze(userId: string, suggestionType: SuggestionType, entityId: string) {
    try {
      await prisma.aiSuggestionInteraction.deleteMany({
        where: { userId, suggestionType, entityId, action: 'SNOOZED' },
      })
      return { error: null }
    } catch (error) {
      return { error: error as Error }
    }
  },
}

import { prisma } from '@/lib/db/prisma'

export const settingsService = {
  async get(userId: string) {
    try {
      let data = await prisma.userSettings.findUnique({ where: { userId } })
      if (!data) {
        data = await prisma.userSettings.create({ data: { userId } })
      }
      return { data, error: null }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  },

  async createDefault(userId: string) {
    try {
      const data = await prisma.userSettings.upsert({
        where: { userId },
        update: {},
        create: { userId },
      })
      return { data, error: null }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  },

  async update(userId: string, updates: Record<string, unknown>) {
    try {
      // Ensure settings row exists
      await prisma.userSettings.upsert({
        where: { userId },
        update: {},
        create: { userId },
      })

      await prisma.userSettings.update({
        where: { userId },
        data: {
          ...(updates.aiProvider !== undefined && { aiProvider: updates.aiProvider as string }),
          ...(updates.aiModel !== undefined && { aiModel: updates.aiModel as string }),
          ...(updates.aiApiKey !== undefined && { aiApiKey: updates.aiApiKey as string }),
          ...(updates.aiGoogleKey !== undefined && { aiGoogleKey: updates.aiGoogleKey as string }),
          ...(updates.aiOpenaiKey !== undefined && { aiOpenaiKey: updates.aiOpenaiKey as string }),
          ...(updates.aiAnthropicKey !== undefined && { aiAnthropicKey: updates.aiAnthropicKey as string }),
          ...(updates.aiThinking !== undefined && { aiThinking: updates.aiThinking as boolean }),
          ...(updates.aiSearch !== undefined && { aiSearch: updates.aiSearch as boolean }),
          ...(updates.aiAnthropicCaching !== undefined && { aiAnthropicCaching: updates.aiAnthropicCaching as boolean }),
          ...(updates.darkMode !== undefined && { darkMode: updates.darkMode as boolean }),
          ...(updates.defaultRoute !== undefined && { defaultRoute: updates.defaultRoute as string }),
          ...(updates.activeBoardId !== undefined && { activeBoardId: updates.activeBoardId as string }),
          ...(updates.inboxViewMode !== undefined && { inboxViewMode: updates.inboxViewMode as string }),
          ...(updates.onboardingCompleted !== undefined && { onboardingCompleted: updates.onboardingCompleted as boolean }),
        },
      })
      return { error: null }
    } catch (error) {
      return { error: error as Error }
    }
  },
}

export const lifecycleStagesService = {
  async getAll() {
    try {
      const data = await prisma.lifecycleStage.findMany({
        orderBy: { order: 'asc' },
      })
      return { data, error: null }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  },

  async create(stage: { id?: string; name: string; color: string; isDefault?: boolean }) {
    try {
      const maxOrder = await prisma.lifecycleStage.aggregate({ _max: { order: true } })
      const order = (maxOrder._max.order ?? -1) + 1

      const data = await prisma.lifecycleStage.create({
        data: {
          id: stage.id ?? crypto.randomUUID(),
          name: stage.name,
          color: stage.color,
          order,
          isDefault: stage.isDefault ?? false,
        },
      })
      return { data, error: null }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  },

  async update(id: string, updates: Partial<{ name: string; color: string; order: number }>) {
    try {
      await prisma.lifecycleStage.update({ where: { id }, data: updates })
      return { error: null }
    } catch (error) {
      return { error: error as Error }
    }
  },

  async delete(id: string) {
    try {
      const stage = await prisma.lifecycleStage.findUnique({ where: { id } })
      if (stage?.isDefault) {
        return { error: new Error('Cannot delete default lifecycle stage') }
      }
      await prisma.lifecycleStage.delete({ where: { id } })
      return { error: null }
    } catch (error) {
      return { error: error as Error }
    }
  },

  async reorder(stages: Array<{ id: string; order: number }>) {
    try {
      await prisma.$transaction(
        stages.map((s) => prisma.lifecycleStage.update({ where: { id: s.id }, data: { order: s.order } }))
      )
      return { error: null }
    } catch (error) {
      return { error: error as Error }
    }
  },
}

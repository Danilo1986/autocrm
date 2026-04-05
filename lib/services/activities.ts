import { prisma } from '@/lib/db/prisma'
import type { Activity } from '@/types'

function toActivity(a: any): Activity {
  return {
    id: a.id,
    organizationId: a.organizationId ?? undefined,
    dealId: a.dealId ?? '',
    contactId: a.contactId ?? undefined,
    clientCompanyId: a.clientCompanyId ?? undefined,
    participantContactIds: a.participantContactIds ?? undefined,
    dealTitle: a.deal?.title ?? a.dealTitle ?? '',
    type: a.type,
    title: a.title,
    description: a.description ?? undefined,
    date: a.date instanceof Date ? a.date.toISOString() : a.date,
    user: a.user ?? { name: '', avatar: '' },
    completed: a.completed ?? false,
  }
}

export const activitiesService = {
  async getAll() {
    try {
      const activities = await prisma.activity.findMany({
        where: { deletedAt: null },
        include: {
          deal: { select: { title: true } },
        },
        orderBy: { date: 'desc' },
      })

      return { data: activities.map(toActivity), error: null }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  },

  async create(activity: {
    title: string
    description?: string
    type: string
    date: string | Date
    dealId?: string
    contactId?: string
    clientCompanyId?: string
    participantContactIds?: string[]
    ownerId?: string
    organizationId?: string
  }) {
    try {
      const raw = await prisma.activity.create({
        data: {
          title: activity.title,
          description: activity.description,
          type: activity.type,
          date: new Date(activity.date),
          dealId: activity.dealId,
          contactId: activity.contactId,
          clientCompanyId: activity.clientCompanyId,
          participantContactIds: activity.participantContactIds ?? [],
          ownerId: activity.ownerId,
          organizationId: activity.organizationId,
        },
        include: { deal: { select: { title: true } } },
      })
      return { data: toActivity(raw), error: null }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  },

  async update(id: string, updates: Record<string, unknown>) {
    try {
      await prisma.activity.update({
        where: { id },
        data: {
          ...(updates.title !== undefined && { title: updates.title as string }),
          ...(updates.description !== undefined && { description: updates.description as string }),
          ...(updates.type !== undefined && { type: updates.type as string }),
          ...(updates.date !== undefined && { date: new Date(updates.date as string) }),
          ...(updates.completed !== undefined && { completed: updates.completed as boolean }),
          ...(updates.dealId !== undefined && { dealId: updates.dealId as string }),
          ...(updates.contactId !== undefined && { contactId: updates.contactId as string | null }),
          ...(updates.clientCompanyId !== undefined && { clientCompanyId: updates.clientCompanyId as string | null }),
          ...(updates.participantContactIds !== undefined && { participantContactIds: updates.participantContactIds as string[] }),
        },
      })
      return { error: null }
    } catch (error) {
      return { error: error as Error }
    }
  },

  async delete(id: string) {
    try {
      await prisma.activity.delete({ where: { id } })
      return { error: null }
    } catch (error) {
      return { error: error as Error }
    }
  },

  async toggleCompletion(id: string) {
    try {
      const activity = await prisma.activity.findUnique({
        where: { id },
        select: { completed: true },
      })
      if (!activity) return { data: null, error: new Error('Activity not found') }

      const newCompleted = !activity.completed
      await prisma.activity.update({
        where: { id },
        data: { completed: newCompleted },
      })
      return { data: newCompleted, error: null }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  },
}

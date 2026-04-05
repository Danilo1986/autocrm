import { prisma } from '@/lib/db/prisma'

export const dashboardService = {
  async getStats() {
    try {
      const [
        totalDeals,
        pipelineValue,
        totalContacts,
        totalCompanies,
        wonDeals,
        wonValue,
        lostDeals,
        activitiesToday,
      ] = await Promise.all([
        prisma.deal.count({ where: { deletedAt: null } }),
        prisma.deal.aggregate({
          where: { isWon: false, isLost: false, deletedAt: null },
          _sum: { value: true },
        }),
        prisma.contact.count({ where: { deletedAt: null } }),
        prisma.crmCompany.count({ where: { deletedAt: null } }),
        prisma.deal.count({ where: { isWon: true, deletedAt: null } }),
        prisma.deal.aggregate({
          where: { isWon: true, deletedAt: null },
          _sum: { value: true },
        }),
        prisma.deal.count({ where: { isLost: true, deletedAt: null } }),
        prisma.activity.count({
          where: {
            deletedAt: null,
            date: {
              gte: new Date(new Date().setHours(0, 0, 0, 0)),
              lt: new Date(new Date().setHours(23, 59, 59, 999)),
            },
          },
        }),
      ])

      return {
        data: {
          total_deals: totalDeals,
          pipeline_value: Number(pipelineValue._sum.value ?? 0),
          total_contacts: totalContacts,
          total_companies: totalCompanies,
          won_deals: wonDeals,
          won_value: Number(wonValue._sum.value ?? 0),
          lost_deals: lostDeals,
          activities_today: activitiesToday,
        },
        error: null,
      }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  },
}

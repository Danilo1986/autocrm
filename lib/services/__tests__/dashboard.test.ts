import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    deal: {
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    contact: {
      count: vi.fn(),
    },
    crmCompany: {
      count: vi.fn(),
    },
    activity: {
      count: vi.fn(),
    },
  },
}))

vi.mock('@/lib/db/prisma', () => ({ prisma: mocks.prisma }))

import { dashboardService } from '../dashboard'

describe('dashboardService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getStats()', () => {
    it('should return all 8 metrics', async () => {
      mocks.prisma.deal.count
        .mockResolvedValueOnce(50)   // totalDeals
        .mockResolvedValueOnce(10)   // wonDeals
        .mockResolvedValueOnce(5)    // lostDeals
      mocks.prisma.deal.aggregate
        .mockResolvedValueOnce({ _sum: { value: 100000 } })  // pipelineValue
        .mockResolvedValueOnce({ _sum: { value: 75000 } })   // wonValue
      mocks.prisma.contact.count.mockResolvedValue(200)
      mocks.prisma.crmCompany.count.mockResolvedValue(30)
      mocks.prisma.activity.count.mockResolvedValue(12)

      const result = await dashboardService.getStats()

      expect(result.error).toBeNull()
      expect(result.data).toEqual({
        total_deals: 50,
        pipeline_value: 100000,
        total_contacts: 200,
        total_companies: 30,
        won_deals: 10,
        won_value: 75000,
        lost_deals: 5,
        activities_today: 12,
      })
    })

    it('should handle zero counts gracefully', async () => {
      mocks.prisma.deal.count.mockResolvedValue(0)
      mocks.prisma.deal.aggregate.mockResolvedValue({ _sum: { value: null } })
      mocks.prisma.contact.count.mockResolvedValue(0)
      mocks.prisma.crmCompany.count.mockResolvedValue(0)
      mocks.prisma.activity.count.mockResolvedValue(0)

      const result = await dashboardService.getStats()

      expect(result.error).toBeNull()
      expect(result.data).toEqual({
        total_deals: 0,
        pipeline_value: 0,
        total_contacts: 0,
        total_companies: 0,
        won_deals: 0,
        won_value: 0,
        lost_deals: 0,
        activities_today: 0,
      })
    })
  })
})

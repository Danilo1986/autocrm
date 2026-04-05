import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    auditLog: {
      create: vi.fn(),
    },
  },
}))

vi.mock('@/lib/db/prisma', () => ({ prisma: mocks.prisma }))

import { auditService } from '../audit'

describe('auditService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('log()', () => {
    it('should create an audit entry with correct fields', async () => {
      mocks.prisma.auditLog.create.mockResolvedValue({ id: 'log-1' })

      const params = {
        userId: 'user-1',
        organizationId: 'org-1',
        action: 'deal.created',
        resourceType: 'deal',
        resourceId: 'deal-42',
        details: { title: 'Big Deal' },
        severity: 'info' as const,
        ipAddress: '10.0.0.1',
        userAgent: 'Mozilla/5.0',
      }

      const result = await auditService.log(params)

      expect(result.error).toBeNull()
      expect(result.data).toBe('log-1')
      expect(mocks.prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          organizationId: 'org-1',
          action: 'deal.created',
          resourceType: 'deal',
          resourceId: 'deal-42',
          details: { title: 'Big Deal' },
          severity: 'info',
          ipAddress: '10.0.0.1',
          userAgent: 'Mozilla/5.0',
        },
      })
    })
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    userConsent: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}))

vi.mock('@/lib/db/prisma', () => ({ prisma: mocks.prisma }))

import { hasConsent, grantConsent, revokeConsent } from '../consent'

describe('consent functions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('hasConsent()', () => {
    it('should return true when consent exists', async () => {
      mocks.prisma.userConsent.findFirst.mockResolvedValue({
        id: 'c-1',
        userId: 'user-1',
        consentType: 'AI_CONSENT',
        revokedAt: null,
      })

      const result = await hasConsent('user-1', 'AI_CONSENT')

      expect(result).toBe(true)
      expect(mocks.prisma.userConsent.findFirst).toHaveBeenCalledWith({
        where: { userId: 'user-1', consentType: 'AI_CONSENT', revokedAt: null },
      })
    })

    it('should return false when no consent', async () => {
      mocks.prisma.userConsent.findFirst.mockResolvedValue(null)

      const result = await hasConsent('user-1', 'AI_CONSENT')

      expect(result).toBe(false)
    })
  })

  describe('grantConsent()', () => {
    it('should create consent and audit log', async () => {
      mocks.prisma.userConsent.findFirst.mockResolvedValue(null) // no existing
      mocks.prisma.userConsent.create.mockResolvedValue({ id: 'c-1' })
      mocks.prisma.auditLog.create.mockResolvedValue({ id: 'log-1' })

      const result = await grantConsent('user-1', 'AI_CONSENT', {
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      })

      expect(result).toBe(true)
      expect(mocks.prisma.userConsent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          consentType: 'AI_CONSENT',
          version: '1.0',
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent',
        }),
      })
      expect(mocks.prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          action: 'consent.granted',
          resourceType: 'user_consent',
        }),
      })
    })
  })

  describe('revokeConsent()', () => {
    it('should set revokedAt', async () => {
      mocks.prisma.userConsent.updateMany.mockResolvedValue({ count: 1 })
      mocks.prisma.auditLog.create.mockResolvedValue({ id: 'log-2' })

      const result = await revokeConsent('user-1', 'AI_CONSENT')

      expect(result).toBe(true)
      expect(mocks.prisma.userConsent.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', consentType: 'AI_CONSENT', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      })
      expect(mocks.prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'consent.revoked',
        }),
      })
    })
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    apiKey: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('@/lib/db/prisma', () => ({ prisma: mocks.prisma }))

import { apiKeysService } from '../apiKeys'

describe('apiKeysService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('create()', () => {
    it('should generate a token starting with ncrm_, store hash, and return token', async () => {
      mocks.prisma.apiKey.create.mockResolvedValue({
        id: 'key-1',
        organizationId: 'org-1',
        keyPrefix: 'ncrm_abc',
        keyHash: 'somehash',
      })

      const result = await apiKeysService.create('org-1', 'My Key', 'user-1')

      expect(result.error).toBeNull()
      expect(result.data).not.toBeNull()
      expect(result.data!.token).toMatch(/^ncrm_/)
      expect(result.data!.apiKeyId).toBe('key-1')
      expect(result.data!.organizationId).toBe('org-1')
      expect(result.data!.keyPrefix).toBeDefined()

      // Verify prisma was called with a hash (not the raw token)
      const createCall = mocks.prisma.apiKey.create.mock.calls[0][0]
      expect(createCall.data.keyHash).toBeDefined()
      expect(createCall.data.keyHash).not.toBe(result.data!.token)
      expect(createCall.data.organizationId).toBe('org-1')
      expect(createCall.data.createdBy).toBe('user-1')
    })
  })

  describe('validate()', () => {
    it('should match by hash and return org info', async () => {
      // We need to create a key first to know the hash
      const token = 'ncrm_testtoken123'
      const crypto = await import('crypto')
      const expectedHash = crypto.createHash('sha256').update(token).digest('hex')

      mocks.prisma.apiKey.findFirst.mockResolvedValue({
        id: 'key-1',
        keyPrefix: 'ncrm_testtok',
        organizationId: 'org-1',
        organization: { name: 'Acme Corp' },
      })
      mocks.prisma.apiKey.update.mockResolvedValue({})

      const result = await apiKeysService.validate(token)

      expect(result.error).toBeNull()
      expect(result.data).toEqual({
        apiKeyId: 'key-1',
        apiKeyPrefix: 'ncrm_testtok',
        organizationId: 'org-1',
        organizationName: 'Acme Corp',
      })

      // Verify findFirst was called with the hash
      expect(mocks.prisma.apiKey.findFirst).toHaveBeenCalledWith({
        where: { keyHash: expectedHash, revokedAt: null },
        include: { organization: { select: { name: true } } },
      })
    })

    it('should return null for invalid token', async () => {
      mocks.prisma.apiKey.findFirst.mockResolvedValue(null)

      const result = await apiKeysService.validate('ncrm_invalid')

      expect(result.error).toBeNull()
      expect(result.data).toBeNull()
    })
  })

  describe('revoke()', () => {
    it('should set revokedAt', async () => {
      mocks.prisma.apiKey.update.mockResolvedValue({})

      const result = await apiKeysService.revoke('key-1', 'org-1')

      expect(result.error).toBeNull()
      expect(mocks.prisma.apiKey.update).toHaveBeenCalledWith({
        where: { id: 'key-1', organizationId: 'org-1' },
        data: { revokedAt: expect.any(Date) },
      })
    })
  })
})

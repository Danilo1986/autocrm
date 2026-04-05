import { prisma } from '@/lib/db/prisma'
import { createHash, randomBytes } from 'crypto'

function makeToken(): string {
  const bytes = randomBytes(24)
  const b64 = bytes.toString('base64url')
  return `ncrm_${b64}`
}

function sha256Hex(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export const apiKeysService = {
  async create(organizationId: string, name: string, createdBy: string) {
    try {
      const token = makeToken()
      const keyPrefix = token.substring(0, 12)
      const keyHash = sha256Hex(token)

      const apiKey = await prisma.apiKey.create({
        data: {
          organizationId,
          name: name || 'Integracao',
          keyPrefix,
          keyHash,
          createdBy,
        },
      })

      return {
        data: {
          apiKeyId: apiKey.id,
          token,
          keyPrefix,
          organizationId,
        },
        error: null,
      }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  },

  async revoke(apiKeyId: string, organizationId: string) {
    try {
      await prisma.apiKey.update({
        where: { id: apiKeyId, organizationId },
        data: { revokedAt: new Date() },
      })
      return { error: null }
    } catch (error) {
      return { error: error as Error }
    }
  },

  async validate(token: string) {
    try {
      if (!token?.trim()) return { data: null, error: null }

      const keyHash = sha256Hex(token)

      const apiKey = await prisma.apiKey.findFirst({
        where: { keyHash, revokedAt: null },
        include: { organization: { select: { name: true } } },
      })

      if (!apiKey) return { data: null, error: null }

      // Touch last_used_at (best-effort)
      prisma.apiKey.update({
        where: { id: apiKey.id },
        data: { lastUsedAt: new Date() },
      }).catch(() => {})

      return {
        data: {
          apiKeyId: apiKey.id,
          apiKeyPrefix: apiKey.keyPrefix,
          organizationId: apiKey.organizationId,
          organizationName: apiKey.organization.name,
        },
        error: null,
      }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  },

  async listForOrganization(organizationId: string) {
    try {
      const data = await prisma.apiKey.findMany({
        where: { organizationId },
        select: {
          id: true,
          name: true,
          keyPrefix: true,
          createdAt: true,
          revokedAt: true,
          lastUsedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      })
      return { data, error: null }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  },
}

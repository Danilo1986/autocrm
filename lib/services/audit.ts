import { prisma } from '@/lib/db/prisma'

export const auditService = {
  async log(params: {
    userId?: string
    organizationId?: string
    action: string
    resourceType: string
    resourceId?: string
    details?: Record<string, unknown>
    severity?: 'debug' | 'info' | 'warning' | 'error' | 'critical'
    ipAddress?: string
    userAgent?: string
  }) {
    try {
      const entry = await prisma.auditLog.create({
        data: {
          userId: params.userId,
          organizationId: params.organizationId,
          action: params.action,
          resourceType: params.resourceType,
          resourceId: params.resourceId,
          details: params.details ?? {},
          severity: params.severity ?? 'info',
          ipAddress: params.ipAddress,
          userAgent: params.userAgent,
        },
      })
      return { data: entry.id, error: null }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  },
}

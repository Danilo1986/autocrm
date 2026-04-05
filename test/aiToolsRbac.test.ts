import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  return {
    prisma: {
      profile: {
        findFirst: vi.fn(async () => ({
          firstName: 'Maria',
          nickname: null,
        })),
      },
      deal: {
        update: vi.fn(async () => ({ title: 'Negocio X' })),
        updateMany: vi.fn(async () => ({ count: 1 })),
        findFirst: vi.fn(async () => ({ title: 'Negocio X' })),
      },
    },
  }
})

vi.mock('@/lib/db/prisma', () => ({
  prisma: mocks.prisma,
}))

import { createCRMTools } from '@/lib/ai/tools'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AI Tools permissions', () => {
  it('permite assignDeal para vendedor', async () => {
    const tools = createCRMTools(
      {
        organizationId: '11111111-1111-1111-1111-111111111111',
      },
      'user-1'
    )

    const res = await tools.assignDeal.execute({
      dealId: 'deal-1',
      newOwnerId: 'user-2',
    })

    expect(res).toMatchObject({
      success: true,
    })

    expect(mocks.prisma.profile.findFirst).toHaveBeenCalledTimes(1)
    expect(mocks.prisma.deal.update).toHaveBeenCalledTimes(1)
    expect(String((res as any).message)).toContain('Maria')
  })
})

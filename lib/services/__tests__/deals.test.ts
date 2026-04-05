import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    deal: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    dealItem: {
      findMany: vi.fn(),
    },
    board: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('@/lib/db/prisma', () => ({ prisma: mocks.prisma }))

import { dealsService } from '../deals'

const now = new Date()

const fakeDealDb = {
  id: 'deal-1',
  organizationId: 'org-1',
  title: 'Enterprise License',
  value: 5000,
  probability: 80,
  stageId: 'stage-1',
  status: null,
  isWon: false,
  isLost: false,
  closedAt: null,
  priority: 'high',
  boardId: 'board-1',
  contactId: 'contact-1',
  clientCompanyId: 'company-1',
  aiSummary: null,
  lossReason: null,
  tags: ['enterprise'],
  lastStageChangeDate: null,
  customFields: {},
  ownerId: null,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  dealItems: [
    {
      id: 'item-1',
      organizationId: 'org-1',
      productId: 'prod-1',
      name: 'License',
      quantity: 2,
      price: 2500,
    },
  ],
}

describe('dealsService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getAll()', () => {
    it('should return deals with items included', async () => {
      mocks.prisma.deal.findMany.mockResolvedValue([fakeDealDb])

      const result = await dealsService.getAll()

      expect(result.error).toBeNull()
      expect(result.data).toHaveLength(1)
      expect(result.data![0].id).toBe('deal-1')
      expect(result.data![0].items).toHaveLength(1)
      expect(result.data![0].items[0].name).toBe('License')
      expect(mocks.prisma.deal.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
        include: { dealItems: true },
        orderBy: { createdAt: 'desc' },
      })
    })
  })

  describe('getById()', () => {
    it('should return a single deal when found', async () => {
      mocks.prisma.deal.findUnique.mockResolvedValue(fakeDealDb)

      const result = await dealsService.getById('deal-1')

      expect(result.error).toBeNull()
      expect(result.data).not.toBeNull()
      expect(result.data!.title).toBe('Enterprise License')
    })

    it('should return error when deal not found', async () => {
      mocks.prisma.deal.findUnique.mockResolvedValue(null)

      const result = await dealsService.getById('nonexistent')

      expect(result.data).toBeNull()
      expect(result.error).toBeInstanceOf(Error)
      expect(result.error!.message).toBe('Deal not found')
    })
  })

  describe('create()', () => {
    it('should validate boardId exists and create deal', async () => {
      mocks.prisma.board.findUnique.mockResolvedValue({
        id: 'board-1',
        organizationId: 'org-1',
      })
      mocks.prisma.deal.create.mockResolvedValue(fakeDealDb)

      const result = await dealsService.create({
        title: 'Enterprise License',
        boardId: 'board-1',
        value: 5000,
      })

      expect(result.error).toBeNull()
      expect(result.data).not.toBeNull()
      expect(result.data!.title).toBe('Enterprise License')
      expect(mocks.prisma.board.findUnique).toHaveBeenCalledWith({
        where: { id: 'board-1' },
        select: { id: true, organizationId: true },
      })
    })

    it('should return error when boardId is missing', async () => {
      const result = await dealsService.create({ title: 'No Board' })

      expect(result.data).toBeNull()
      expect(result.error!.message).toBe('Board ID is required')
    })

    it('should return error when board not found', async () => {
      mocks.prisma.board.findUnique.mockResolvedValue(null)

      const result = await dealsService.create({
        title: 'Bad Board',
        boardId: 'nonexistent',
      })

      expect(result.data).toBeNull()
      expect(result.error!.message).toContain('Board not found')
    })
  })

  describe('markAsWon()', () => {
    it('should set isWon=true and closedAt', async () => {
      mocks.prisma.deal.update.mockResolvedValue({})

      const result = await dealsService.markAsWon('deal-1')

      expect(result.error).toBeNull()
      const call = mocks.prisma.deal.update.mock.calls[0][0]
      expect(call.where).toEqual({ id: 'deal-1' })
      expect(call.data.isWon).toBe(true)
      expect(call.data.isLost).toBe(false)
      expect(call.data.closedAt).toBeInstanceOf(Date)
    })
  })

  describe('markAsLost()', () => {
    it('should set isLost=true and lossReason', async () => {
      mocks.prisma.deal.update.mockResolvedValue({})

      const result = await dealsService.markAsLost('deal-1', 'Too expensive')

      expect(result.error).toBeNull()
      const call = mocks.prisma.deal.update.mock.calls[0][0]
      expect(call.data.isLost).toBe(true)
      expect(call.data.isWon).toBe(false)
      expect(call.data.closedAt).toBeInstanceOf(Date)
      expect(call.data.lossReason).toBe('Too expensive')
    })
  })

  describe('reopen()', () => {
    it('should clear isWon, isLost, and closedAt', async () => {
      mocks.prisma.deal.update.mockResolvedValue({})

      const result = await dealsService.reopen('deal-1')

      expect(result.error).toBeNull()
      expect(mocks.prisma.deal.update).toHaveBeenCalledWith({
        where: { id: 'deal-1' },
        data: {
          isWon: false,
          isLost: false,
          closedAt: null,
        },
      })
    })
  })

  describe('recalculateDealValue()', () => {
    it('should sum items price * quantity and update deal value', async () => {
      mocks.prisma.dealItem.findMany.mockResolvedValue([
        { price: 100, quantity: 3 },
        { price: 50, quantity: 2 },
      ])
      mocks.prisma.deal.update.mockResolvedValue({})

      const result = await dealsService.recalculateDealValue('deal-1')

      expect(result.error).toBeNull()
      expect(mocks.prisma.deal.update).toHaveBeenCalledWith({
        where: { id: 'deal-1' },
        data: { value: 400 }, // 100*3 + 50*2
      })
    })
  })
})

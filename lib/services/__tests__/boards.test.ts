import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    board: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    boardStage: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    deal: {
      count: vi.fn(),
    },
  },
}))

vi.mock('@/lib/db/prisma', () => ({ prisma: mocks.prisma }))

import { boardsService, boardStagesService } from '../boards'

const now = new Date()

const fakeStage = {
  id: 'stage-1',
  boardId: 'board-1',
  name: 'Novo',
  label: 'Novo',
  color: 'bg-blue-500',
  order: 0,
  isDefault: false,
  linkedLifecycleStage: null,
  organizationId: 'org-1',
  createdAt: now,
  updatedAt: now,
}

const fakeBoard = {
  id: 'board-1',
  organizationId: 'org-1',
  key: 'sales',
  name: 'Sales Pipeline',
  description: null,
  type: 'SALES',
  isDefault: true,
  position: 0,
  createdAt: now,
  updatedAt: now,
  stages: [fakeStage],
}

describe('boardsService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getAll()', () => {
    it('should return boards with stages included', async () => {
      mocks.prisma.board.findMany.mockResolvedValue([fakeBoard])

      const result = await boardsService.getAll()

      expect(result.error).toBeNull()
      expect(result.data).toHaveLength(1)
      expect(result.data![0].name).toBe('Sales Pipeline')
      expect(result.data![0].stages).toHaveLength(1)
      expect(mocks.prisma.board.findMany).toHaveBeenCalledWith({
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        include: {
          stages: {
            orderBy: { order: 'asc' },
          },
        },
      })
    })
  })

  describe('get()', () => {
    it('should return a single board with stages', async () => {
      mocks.prisma.board.findUnique.mockResolvedValue(fakeBoard)

      const result = await boardsService.get('board-1')

      expect(result).not.toBeNull()
      expect(result.name).toBe('Sales Pipeline')
      expect(result.stages).toHaveLength(1)
    })

    it('should return null for empty id', async () => {
      const result = await boardsService.get('')

      expect(result).toBeNull()
      expect(mocks.prisma.board.findUnique).not.toHaveBeenCalled()
    })

    it('should return null when board not found', async () => {
      mocks.prisma.board.findUnique.mockResolvedValue(null)

      const result = await boardsService.get('nonexistent')

      expect(result).toBeNull()
    })
  })

  describe('canDelete()', () => {
    it('should return true when no active deals exist', async () => {
      mocks.prisma.deal.count.mockResolvedValue(0)

      const result = await boardsService.canDelete('board-1')

      expect(result.canDelete).toBe(true)
      expect(result.dealCount).toBe(0)
      expect(result.error).toBeNull()
      expect(mocks.prisma.deal.count).toHaveBeenCalledWith({
        where: {
          boardId: 'board-1',
          deletedAt: null,
          isWon: false,
          isLost: false,
        },
      })
    })

    it('should return false when active deals exist', async () => {
      mocks.prisma.deal.count.mockResolvedValue(3)

      const result = await boardsService.canDelete('board-1')

      expect(result.canDelete).toBe(false)
      expect(result.dealCount).toBe(3)
      expect(result.error).toBeNull()
    })
  })

  describe('addStage()', () => {
    it('should create stage with auto-calculated order', async () => {
      mocks.prisma.boardStage.findFirst.mockResolvedValue({ order: 2 })
      mocks.prisma.board.findUnique.mockResolvedValue({ organizationId: 'org-1' })
      const createdStage = {
        ...fakeStage,
        id: 'stage-new',
        name: 'Negotiation',
        label: 'Negotiation',
        order: 3,
      }
      mocks.prisma.boardStage.create.mockResolvedValue(createdStage)

      const result = await boardsService.addStage('board-1', {
        label: 'Negotiation',
        color: 'bg-orange-500',
      })

      expect(result.error).toBeNull()
      expect(result.data).not.toBeNull()
      expect(result.data.label).toBe('Negotiation')

      const createCall = mocks.prisma.boardStage.create.mock.calls[0][0]
      expect(createCall.data.order).toBe(3)
      expect(createCall.data.boardId).toBe('board-1')
      expect(createCall.data.organizationId).toBe('org-1')
    })

    it('should use order 0 when no existing stages', async () => {
      mocks.prisma.boardStage.findFirst.mockResolvedValue(null)
      mocks.prisma.board.findUnique.mockResolvedValue({ organizationId: 'org-1' })
      mocks.prisma.boardStage.create.mockResolvedValue({ ...fakeStage, order: 0 })

      await boardsService.addStage('board-1', { name: 'First Stage' })

      const createCall = mocks.prisma.boardStage.create.mock.calls[0][0]
      expect(createCall.data.order).toBe(0)
    })
  })
})

describe('boardStagesService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getByBoardId()', () => {
    it('should return stages for a specific board', async () => {
      mocks.prisma.boardStage.findMany.mockResolvedValue([fakeStage])

      const result = await boardStagesService.getByBoardId('board-1')

      expect(result.error).toBeNull()
      expect(result.data).toHaveLength(1)
      expect(result.data![0].name).toBe('Novo')
      expect(mocks.prisma.boardStage.findMany).toHaveBeenCalledWith({
        where: { boardId: 'board-1' },
        orderBy: { order: 'asc' },
      })
    })

    it('should return empty array for empty boardId', async () => {
      const result = await boardStagesService.getByBoardId('')

      expect(result.data).toEqual([])
      expect(result.error).toBeNull()
      expect(mocks.prisma.boardStage.findMany).not.toHaveBeenCalled()
    })
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    contact: {
      findMany: vi.fn(),
      groupBy: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    deal: {
      findMany: vi.fn(),
    },
    crmCompany: {
      findMany: vi.fn(),
    },
  },
}))

vi.mock('@/lib/db/prisma', () => ({ prisma: mocks.prisma }))

import { contactsService, companiesService } from '../contacts'

const now = new Date()

const fakeContact = {
  id: 'contact-1',
  organizationId: 'org-1',
  name: 'John Doe',
  email: 'john@example.com',
  phone: '+5511999999999',
  stage: 'LEAD',
  status: 'ACTIVE',
  createdAt: now,
  updatedAt: now,
}

describe('contactsService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getAll()', () => {
    it('should return contacts sorted by createdAt desc', async () => {
      mocks.prisma.contact.findMany.mockResolvedValue([fakeContact])

      const result = await contactsService.getAll()

      expect(result.error).toBeNull()
      expect(result.data).toHaveLength(1)
      expect(result.data![0].name).toBe('John Doe')
      expect(mocks.prisma.contact.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
        take: 10000,
      })
    })
  })

  describe('getStageCounts()', () => {
    it('should group contacts by stage and return counts', async () => {
      mocks.prisma.contact.groupBy.mockResolvedValue([
        { stage: 'LEAD', _count: 5 },
        { stage: 'CUSTOMER', _count: 12 },
      ])

      const result = await contactsService.getStageCounts()

      expect(result.error).toBeNull()
      expect(result.data).toEqual({ LEAD: 5, CUSTOMER: 12 })
      expect(mocks.prisma.contact.groupBy).toHaveBeenCalledWith({
        by: ['stage'],
        _count: true,
        where: { deletedAt: null },
      })
    })
  })

  describe('getAllPaginated()', () => {
    it('should return paginated contacts with search filter', async () => {
      mocks.prisma.contact.findMany.mockResolvedValue([fakeContact])
      mocks.prisma.contact.count.mockResolvedValue(1)

      const result = await contactsService.getAllPaginated(
        { pageIndex: 0, pageSize: 20 },
        { search: 'John' }
      )

      expect(result.error).toBeNull()
      expect(result.data).not.toBeNull()
      expect(result.data!.data).toHaveLength(1)
      expect(result.data!.totalCount).toBe(1)
      expect(result.data!.hasMore).toBe(false)

      // Verify search filter was applied with OR on name/email
      const findManyCall = mocks.prisma.contact.findMany.mock.calls[0][0]
      expect(findManyCall.where.OR).toEqual([
        { name: { contains: 'John', mode: 'insensitive' } },
        { email: { contains: 'John', mode: 'insensitive' } },
      ])
    })

    it('should calculate hasMore correctly', async () => {
      mocks.prisma.contact.findMany.mockResolvedValue([fakeContact])
      mocks.prisma.contact.count.mockResolvedValue(50)

      const result = await contactsService.getAllPaginated(
        { pageIndex: 0, pageSize: 20 }
      )

      expect(result.data!.hasMore).toBe(true)
    })
  })

  describe('create()', () => {
    it('should create a contact and return it', async () => {
      const input = { name: 'Jane Doe', email: 'jane@example.com', stage: 'LEAD' }
      mocks.prisma.contact.create.mockResolvedValue({
        ...fakeContact,
        id: 'contact-2',
        ...input,
      })

      const result = await contactsService.create(input)

      expect(result.error).toBeNull()
      expect(result.data).not.toBeNull()
      expect(result.data.name).toBe('Jane Doe')
      expect(mocks.prisma.contact.create).toHaveBeenCalledWith({ data: input })
    })
  })

  describe('hasDeals()', () => {
    it('should return deal count and deal list for a contact', async () => {
      mocks.prisma.deal.findMany.mockResolvedValue([
        { id: 'deal-1', title: 'Deal A' },
        { id: 'deal-2', title: 'Deal B' },
      ])

      const result = await contactsService.hasDeals('contact-1')

      expect(result.error).toBeNull()
      expect(result.hasDeals).toBe(true)
      expect(result.dealCount).toBe(2)
      expect(result.deals).toHaveLength(2)
      expect(mocks.prisma.deal.findMany).toHaveBeenCalledWith({
        where: { contactId: 'contact-1' },
        select: { id: true, title: true },
      })
    })

    it('should return hasDeals=false when contact has no deals', async () => {
      mocks.prisma.deal.findMany.mockResolvedValue([])

      const result = await contactsService.hasDeals('contact-1')

      expect(result.hasDeals).toBe(false)
      expect(result.dealCount).toBe(0)
    })
  })
})

describe('companiesService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getAll()', () => {
    it('should return companies sorted by createdAt desc', async () => {
      const fakeCompany = {
        id: 'company-1',
        name: 'Acme Corp',
        createdAt: new Date(),
      }
      mocks.prisma.crmCompany.findMany.mockResolvedValue([fakeCompany])

      const result = await companiesService.getAll()

      expect(result.error).toBeNull()
      expect(result.data).toHaveLength(1)
      expect(result.data![0].name).toBe('Acme Corp')
      expect(mocks.prisma.crmCompany.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
        take: 10000,
      })
    })
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    product: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}))

vi.mock('@/lib/db/prisma', () => ({ prisma: mocks.prisma }))

import { productsService } from '../products'

const fakeProduct = {
  id: 'prod-1',
  organizationId: 'org-1',
  name: 'Widget',
  description: 'A fine widget',
  price: 29.99, // Number() in toProduct converts this
  sku: 'WDG-001',
  active: true,
  createdAt: new Date(),
}

describe('productsService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getAll()', () => {
    it('should return products with number price (not Decimal)', async () => {
      mocks.prisma.product.findMany.mockResolvedValue([fakeProduct])

      const result = await productsService.getAll()

      expect(result.error).toBeNull()
      expect(result.data).toHaveLength(1)
      expect(result.data[0].price).toBe(29.99)
      expect(typeof result.data[0].price).toBe('number')
      expect(result.data[0].name).toBe('Widget')
    })
  })

  describe('getActive()', () => {
    it('should filter by active=true', async () => {
      mocks.prisma.product.findMany.mockResolvedValue([fakeProduct])

      const result = await productsService.getActive()

      expect(result.error).toBeNull()
      expect(result.data).toHaveLength(1)
      expect(mocks.prisma.product.findMany).toHaveBeenCalledWith({
        where: { active: true },
        orderBy: { createdAt: 'desc' },
      })
    })
  })

  describe('create()', () => {
    it('should return product with id', async () => {
      const input = { name: 'New Product', price: 49.99, sku: 'NP-001' }
      mocks.prisma.product.create.mockResolvedValue({
        ...fakeProduct,
        id: 'prod-2',
        name: input.name,
        price: input.price,
        sku: input.sku,
      })

      const result = await productsService.create(input)

      expect(result.error).toBeNull()
      expect(result.data).not.toBeNull()
      expect(result.data!.id).toBe('prod-2')
      expect(result.data!.name).toBe('New Product')
      expect(typeof result.data!.price).toBe('number')
    })
  })
})

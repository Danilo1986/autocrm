import { prisma } from '@/lib/db/prisma'
import type { Product } from '@/types'

function toProduct(p: any): Product {
  return {
    id: p.id,
    organizationId: p.organizationId ?? undefined,
    name: p.name,
    description: p.description ?? undefined,
    price: Number(p.price),
    sku: p.sku ?? undefined,
    active: p.active ?? true,
  }
}

export const productsService = {
  async getAll() {
    try {
      const raw = await prisma.product.findMany({
        orderBy: { createdAt: 'desc' },
      })
      return { data: raw.map(toProduct), error: null }
    } catch (error) {
      return { data: [], error: error as Error }
    }
  },

  async getActive() {
    try {
      const raw = await prisma.product.findMany({
        where: { active: true },
        orderBy: { createdAt: 'desc' },
      })
      return { data: raw.map(toProduct), error: null }
    } catch (error) {
      return { data: [], error: error as Error }
    }
  },

  async create(input: {
    name: string
    price: number
    sku?: string
    description?: string
    ownerId?: string
    organizationId?: string
  }) {
    try {
      const raw = await prisma.product.create({
        data: {
          name: input.name,
          price: input.price,
          sku: input.sku,
          description: input.description,
          ownerId: input.ownerId,
          organizationId: input.organizationId,
        },
      })
      return { data: toProduct(raw), error: null }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  },

  async update(id: string, updates: Partial<{ name: string; price: number; sku: string; description: string; active: boolean }>) {
    try {
      await prisma.product.update({ where: { id }, data: updates })
      return { error: null }
    } catch (error) {
      return { error: error as Error }
    }
  },

  async delete(id: string) {
    try {
      await prisma.product.delete({ where: { id } })
      return { error: null }
    } catch (error) {
      return { error: error as Error }
    }
  },
}

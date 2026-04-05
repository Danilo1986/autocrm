/**
 * @fileoverview Prisma-based service for deal (opportunity) management.
 *
 * Drop-in replacement for lib/supabase/deals.ts.
 * All methods return the same { data, error } / { error } shape.
 *
 * @module lib/services/deals
 */

import { prisma } from '@/lib/db/prisma'
import { Deal, DealItem } from '@/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Transform a Prisma Deal (with dealItems) into the application Deal type.
 */
function transformDeal(db: any): Deal {
  const dealItems: any[] = db.dealItems ?? []

  return {
    id: db.id,
    organizationId: db.organizationId,
    title: db.title,
    value: Number(db.value) || 0,
    probability: db.probability || 0,
    status: db.stageId || db.status || '',
    isWon: db.isWon ?? false,
    isLost: db.isLost ?? false,
    closedAt: db.closedAt?.toISOString() ?? undefined,
    priority: (db.priority as Deal['priority']) || 'medium',
    boardId: db.boardId || '',
    contactId: db.contactId || '',
    clientCompanyId: db.clientCompanyId ?? undefined,
    companyId: db.clientCompanyId || '',
    aiSummary: db.aiSummary ?? undefined,
    lossReason: db.lossReason ?? undefined,
    tags: db.tags || [],
    lastStageChangeDate: db.lastStageChangeDate?.toISOString() ?? undefined,
    customFields: db.customFields as Record<string, any> ?? {},
    createdAt: db.createdAt?.toISOString() ?? '',
    updatedAt: db.updatedAt?.toISOString() ?? '',
    items: dealItems.map((i: any) => ({
      id: i.id,
      organizationId: i.organizationId ?? undefined,
      productId: i.productId || '',
      name: i.name,
      quantity: i.quantity,
      price: Number(i.price),
    })),
    owner: { name: 'Sem Dono', avatar: '' },
    ownerId: db.ownerId ?? undefined,
  }
}

/**
 * Build a Prisma-compatible data object from a partial Deal (app format).
 */
function transformDealToDb(deal: Partial<Deal>): Record<string, any> {
  const db: Record<string, any> = {}

  if (deal.title !== undefined) db.title = deal.title
  if (deal.value !== undefined) db.value = deal.value
  if (deal.probability !== undefined) db.probability = deal.probability
  if (deal.status !== undefined) db.stageId = deal.status
  if (deal.isWon !== undefined) db.isWon = deal.isWon
  if (deal.isLost !== undefined) db.isLost = deal.isLost
  if (deal.closedAt !== undefined) db.closedAt = deal.closedAt ? new Date(deal.closedAt) : null
  if (deal.priority !== undefined) db.priority = deal.priority
  if (deal.boardId !== undefined) db.boardId = deal.boardId || null
  if (deal.contactId !== undefined) db.contactId = deal.contactId || null
  if (deal.clientCompanyId !== undefined) db.clientCompanyId = deal.clientCompanyId || null
  else if (deal.companyId !== undefined) db.clientCompanyId = deal.companyId || null
  if (deal.aiSummary !== undefined) db.aiSummary = deal.aiSummary || null
  if (deal.lossReason !== undefined) db.lossReason = deal.lossReason || null
  if (deal.tags !== undefined) db.tags = deal.tags
  if (deal.lastStageChangeDate !== undefined) {
    db.lastStageChangeDate = deal.lastStageChangeDate ? new Date(deal.lastStageChangeDate) : null
  }
  if (deal.customFields !== undefined) db.customFields = deal.customFields || {}
  if (deal.ownerId !== undefined) db.ownerId = deal.ownerId || null

  return db
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const dealsService = {
  async getAll(): Promise<{ data: Deal[] | null; error: Error | null }> {
    try {
      const deals = await prisma.deal.findMany({
        where: { deletedAt: null },
        include: { dealItems: true },
        orderBy: { createdAt: 'desc' },
      })

      return { data: deals.map(transformDeal), error: null }
    } catch (e) {
      return { data: null, error: e as Error }
    }
  },

  async getById(id: string): Promise<{ data: Deal | null; error: Error | null }> {
    try {
      const deal = await prisma.deal.findUnique({
        where: { id },
        include: { dealItems: true },
      })

      if (!deal) return { data: null, error: new Error('Deal not found') }

      return { data: transformDeal(deal), error: null }
    } catch (e) {
      return { data: null, error: e as Error }
    }
  },

  async create(
    deal: any,
    stageId?: string,
  ): Promise<{ data: Deal | null; error: Error | null }> {
    try {
      const resolvedStageId = stageId || deal.stageId || deal.status || null

      if (!deal.boardId) {
        return { data: null, error: new Error('Board ID is required') }
      }

      // Verify board exists and infer organizationId if missing
      const board = await prisma.board.findUnique({
        where: { id: deal.boardId },
        select: { id: true, organizationId: true },
      })

      if (!board) {
        return {
          data: null,
          error: new Error(`Board not found: ${deal.boardId}. Reload the page.`),
        }
      }

      const organizationId = deal.organizationId || board.organizationId
      if (!organizationId) {
        return {
          data: null,
          error: new Error('Organization could not be determined for this deal.'),
        }
      }

      const created = await prisma.deal.create({
        data: {
          organizationId,
          title: deal.title,
          value: deal.value || 0,
          probability: deal.probability || 0,
          status: deal.status || null,
          priority: deal.priority || 'medium',
          boardId: deal.boardId,
          stageId: resolvedStageId,
          contactId: deal.contactId || null,
          clientCompanyId: deal.clientCompanyId || deal.companyId || null,
          tags: deal.tags || [],
          customFields: deal.customFields || {},
          ownerId: deal.ownerId || null,
          isWon: deal.isWon ?? false,
          isLost: deal.isLost ?? false,
          closedAt: deal.closedAt ? new Date(deal.closedAt) : null,
        },
        include: { dealItems: true },
      })

      // Create items if provided
      if (deal.items && deal.items.length > 0) {
        await prisma.dealItem.createMany({
          data: deal.items.map((item: any) => ({
            dealId: created.id,
            organizationId,
            productId: item.productId || null,
            name: item.name,
            quantity: item.quantity,
            price: item.price,
          })),
        })

        // Re-fetch with items
        const withItems = await prisma.deal.findUnique({
          where: { id: created.id },
          include: { dealItems: true },
        })

        return { data: transformDeal(withItems!), error: null }
      }

      return { data: transformDeal(created), error: null }
    } catch (e) {
      return { data: null, error: e as Error }
    }
  },

  async update(id: string, updates: Partial<Deal>): Promise<{ error: Error | null }> {
    try {
      const dbUpdates = transformDealToDb(updates)

      await prisma.deal.update({
        where: { id },
        data: dbUpdates,
      })

      return { error: null }
    } catch (e) {
      return { error: e as Error }
    }
  },

  async delete(id: string): Promise<{ error: Error | null }> {
    try {
      // Hard delete - dealItems cascade via FK
      await prisma.deal.delete({ where: { id } })
      return { error: null }
    } catch (e) {
      return { error: e as Error }
    }
  },

  async deleteByBoardId(boardId: string): Promise<{ error: Error | null }> {
    try {
      await prisma.deal.deleteMany({ where: { boardId } })
      return { error: null }
    } catch (e) {
      return { error: e as Error }
    }
  },

  async addItem(
    dealId: string,
    item: any,
  ): Promise<{ data: any | null; error: Error | null }> {
    try {
      const created = await prisma.dealItem.create({
        data: {
          dealId,
          productId: item.productId || null,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
        },
      })

      // Recalculate deal value
      await this.recalculateDealValue(dealId)

      return {
        data: {
          id: created.id,
          productId: created.productId || '',
          name: created.name,
          quantity: created.quantity,
          price: Number(created.price),
        },
        error: null,
      }
    } catch (e) {
      return { data: null, error: e as Error }
    }
  },

  async removeItem(dealId: string, itemId: string): Promise<{ error: Error | null }> {
    try {
      await prisma.dealItem.delete({ where: { id: itemId } })

      // Recalculate deal value
      await this.recalculateDealValue(dealId)

      return { error: null }
    } catch (e) {
      return { error: e as Error }
    }
  },

  async recalculateDealValue(dealId: string): Promise<{ error: Error | null }> {
    try {
      const items = await prisma.dealItem.findMany({
        where: { dealId },
        select: { price: true, quantity: true },
      })

      const newValue = items.reduce(
        (sum, i) => sum + Number(i.price) * i.quantity,
        0,
      )

      await prisma.deal.update({
        where: { id: dealId },
        data: { value: newValue },
      })

      return { error: null }
    } catch (e) {
      return { error: e as Error }
    }
  },

  async markAsWon(dealId: string): Promise<{ error: Error | null }> {
    try {
      await prisma.deal.update({
        where: { id: dealId },
        data: {
          isWon: true,
          isLost: false,
          closedAt: new Date(),
        },
      })

      return { error: null }
    } catch (e) {
      return { error: e as Error }
    }
  },

  async markAsLost(dealId: string, lossReason?: string): Promise<{ error: Error | null }> {
    try {
      await prisma.deal.update({
        where: { id: dealId },
        data: {
          isLost: true,
          isWon: false,
          closedAt: new Date(),
          ...(lossReason ? { lossReason } : {}),
        },
      })

      return { error: null }
    } catch (e) {
      return { error: e as Error }
    }
  },

  async reopen(dealId: string): Promise<{ error: Error | null }> {
    try {
      await prisma.deal.update({
        where: { id: dealId },
        data: {
          isWon: false,
          isLost: false,
          closedAt: null,
        },
      })

      return { error: null }
    } catch (e) {
      return { error: e as Error }
    }
  },
}

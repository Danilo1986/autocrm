/**
 * @fileoverview Prisma-based service for CRM contacts and companies.
 *
 * Replaces lib/supabase/contacts.ts. All queries go through the extended
 * Prisma client which auto-filters soft-deleted records (deletedAt != null).
 *
 * @module lib/services/contacts
 */

import { prisma } from '@/lib/db/prisma'

// ============================================
// CONTACTS SERVICE
// ============================================

export const contactsService = {
  /**
   * Group contacts by stage and return counts.
   */
  async getStageCounts(): Promise<{ data: Record<string, number> | null; error: Error | null }> {
    try {
      const groups = await prisma.contact.groupBy({
        by: ['stage'],
        _count: true,
        where: { deletedAt: null },
      })

      const counts: Record<string, number> = {}
      for (const row of groups) {
        counts[row.stage] = row._count
      }

      return { data: counts, error: null }
    } catch (e) {
      return { data: null, error: e as Error }
    }
  },

  /**
   * Fetch contacts by a list of IDs.
   */
  async getByIds(ids: string[]): Promise<{ data: any[] | null; error: Error | null }> {
    try {
      if (!ids || ids.length === 0) {
        return { data: [], error: null }
      }

      const uniqueIds = [...new Set(ids.filter(Boolean))]
      if (uniqueIds.length === 0) {
        return { data: [], error: null }
      }

      const contacts = await prisma.contact.findMany({
        where: { id: { in: uniqueIds } },
      })

      return { data: contacts, error: null }
    } catch (e) {
      return { data: null, error: e as Error }
    }
  },

  /**
   * Fetch all contacts (limit 10 000, sorted by created_at DESC).
   */
  async getAll(): Promise<{ data: any[] | null; error: Error | null }> {
    try {
      const contacts = await prisma.contact.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10000,
      })

      return { data: contacts, error: null }
    } catch (e) {
      return { data: null, error: e as Error }
    }
  },

  /**
   * Paginated contacts with server-side filters.
   */
  async getAllPaginated(
    pagination: { pageIndex: number; pageSize: number },
    filters?: {
      search?: string
      stage?: string
      status?: string
      dateStart?: string
      dateEnd?: string
      clientCompanyId?: string
    }
  ): Promise<{
    data: {
      data: any[]
      totalCount: number
      pageIndex: number
      pageSize: number
      hasMore: boolean
    } | null
    error: Error | null
  }> {
    try {
      const { pageIndex, pageSize } = pagination
      const where: any = {}

      if (filters) {
        // Search: OR on name / email (case-insensitive)
        if (filters.search && filters.search.trim()) {
          const term = filters.search.trim()
          where.OR = [
            { name: { contains: term, mode: 'insensitive' } },
            { email: { contains: term, mode: 'insensitive' } },
          ]
        }

        // Stage filter
        if (filters.stage && filters.stage !== 'ALL') {
          where.stage = filters.stage
        }

        // Status filter (with RISK logic)
        if (filters.status && filters.status !== 'ALL') {
          if (filters.status === 'RISK') {
            const thirtyDaysAgo = new Date()
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
            where.status = 'ACTIVE'
            where.lastPurchaseDate = { lt: thirtyDaysAgo }
          } else {
            where.status = filters.status
          }
        }

        // Date range on createdAt
        if (filters.dateStart || filters.dateEnd) {
          where.createdAt = {} as any
          if (filters.dateStart) {
            where.createdAt.gte = new Date(filters.dateStart)
          }
          if (filters.dateEnd) {
            where.createdAt.lte = new Date(filters.dateEnd)
          }
        }

        // Client company filter
        if (filters.clientCompanyId) {
          where.clientCompanyId = filters.clientCompanyId
        }
      }

      const [contacts, totalCount] = await Promise.all([
        prisma.contact.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: pageIndex * pageSize,
          take: pageSize,
        }),
        prisma.contact.count({ where }),
      ])

      const hasMore = (pageIndex + 1) * pageSize < totalCount

      return {
        data: {
          data: contacts,
          totalCount,
          pageIndex,
          pageSize,
          hasMore,
        },
        error: null,
      }
    } catch (e) {
      return { data: null, error: e as Error }
    }
  },

  /**
   * Create a new contact.
   */
  async create(contact: any): Promise<{ data: any | null; error: Error | null }> {
    try {
      const created = await prisma.contact.create({
        data: contact,
      })

      return { data: created, error: null }
    } catch (e) {
      return { data: null, error: e as Error }
    }
  },

  /**
   * Update a contact by ID.
   */
  async update(id: string, updates: any): Promise<{ error: Error | null }> {
    try {
      await prisma.contact.update({
        where: { id },
        data: updates,
      })

      return { error: null }
    } catch (e) {
      return { error: e as Error }
    }
  },

  /**
   * Delete a contact and its contact-only activities.
   */
  async delete(id: string): Promise<{ error: Error | null }> {
    try {
      await prisma.$transaction(async (tx) => {
        // Delete activities linked only to this contact (no deal)
        await tx.activity.deleteMany({
          where: { contactId: id },
        })

        await tx.contact.delete({
          where: { id },
        })
      })

      return { error: null }
    } catch (e) {
      return { error: e as Error }
    }
  },

  /**
   * Check whether a contact has associated deals.
   */
  async hasDeals(
    contactId: string
  ): Promise<{
    hasDeals: boolean
    dealCount: number
    deals: Array<{ id: string; title: string }>
    error: Error | null
  }> {
    try {
      const deals = await prisma.deal.findMany({
        where: { contactId },
        select: { id: true, title: true },
      })

      return {
        hasDeals: deals.length > 0,
        dealCount: deals.length,
        deals,
        error: null,
      }
    } catch (e) {
      return { hasDeals: false, dealCount: 0, deals: [], error: e as Error }
    }
  },

  /**
   * Delete all deals for a contact, then delete the contact itself.
   */
  async deleteWithDeals(contactId: string): Promise<{ error: Error | null }> {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.deal.deleteMany({
          where: { contactId },
        })

        await tx.activity.deleteMany({
          where: { contactId },
        })

        await tx.contact.delete({
          where: { id: contactId },
        })
      })

      return { error: null }
    } catch (e) {
      return { error: e as Error }
    }
  },
}

// ============================================
// COMPANIES SERVICE
// ============================================

export const companiesService = {
  /**
   * Fetch companies by a list of IDs.
   */
  async getByIds(ids: string[]): Promise<{ data: any[] | null; error: Error | null }> {
    try {
      if (!ids || ids.length === 0) {
        return { data: [], error: null }
      }

      const uniqueIds = [...new Set(ids.filter(Boolean))]
      if (uniqueIds.length === 0) {
        return { data: [], error: null }
      }

      const companies = await prisma.crmCompany.findMany({
        where: { id: { in: uniqueIds } },
      })

      return { data: companies, error: null }
    } catch (e) {
      return { data: null, error: e as Error }
    }
  },

  /**
   * Fetch all CRM companies (limit 10 000, sorted by created_at DESC).
   */
  async getAll(): Promise<{ data: any[] | null; error: Error | null }> {
    try {
      const companies = await prisma.crmCompany.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10000,
      })

      return { data: companies, error: null }
    } catch (e) {
      return { data: null, error: e as Error }
    }
  },

  /**
   * Create a new CRM company.
   */
  async create(company: any): Promise<{ data: any | null; error: Error | null }> {
    try {
      const created = await prisma.crmCompany.create({
        data: company,
      })

      return { data: created, error: null }
    } catch (e) {
      return { data: null, error: e as Error }
    }
  },

  /**
   * Update a CRM company by ID.
   */
  async update(id: string, updates: any): Promise<{ error: Error | null }> {
    try {
      await prisma.crmCompany.update({
        where: { id },
        data: updates,
      })

      return { error: null }
    } catch (e) {
      return { error: e as Error }
    }
  },

  /**
   * Delete a CRM company. Clears FK references in contacts and deals first.
   */
  async delete(id: string): Promise<{ error: Error | null }> {
    try {
      await prisma.$transaction(async (tx) => {
        // Clear FK references to avoid constraint errors
        await tx.contact.updateMany({
          where: { clientCompanyId: id },
          data: { clientCompanyId: null },
        })

        await tx.deal.updateMany({
          where: { clientCompanyId: id },
          data: { clientCompanyId: null },
        })

        await tx.crmCompany.delete({
          where: { id },
        })
      })

      return { error: null }
    } catch (e) {
      return { error: e as Error }
    }
  },
}

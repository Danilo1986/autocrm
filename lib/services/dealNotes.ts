import { prisma } from '@/lib/db/prisma'
import type { DealNote as PrismaDealNote } from '@prisma/client'

export type DealNote = PrismaDealNote

export const dealNotesService = {
  async getNotesForDeal(dealId: string) {
    try {
      const data = await prisma.dealNote.findMany({
        where: { dealId },
        orderBy: { createdAt: 'desc' },
      })
      return { data, error: null }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  },

  async createNote(dealId: string, content: string, createdBy?: string) {
    try {
      const data = await prisma.dealNote.create({
        data: { dealId, content, createdBy },
      })
      return { data, error: null }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  },

  async updateNote(noteId: string, content: string) {
    try {
      const data = await prisma.dealNote.update({
        where: { id: noteId },
        data: { content },
      })
      return { data, error: null }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  },

  async deleteNote(noteId: string) {
    try {
      await prisma.dealNote.delete({ where: { id: noteId } })
      return { error: null }
    } catch (error) {
      return { error: error as Error }
    }
  },
}

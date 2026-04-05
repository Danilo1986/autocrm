// Migration shim - re-exports from Prisma service
export { dealNotesService } from '../services/dealNotes'

// Re-export Prisma-generated type for importers that need DealNote
import type { DealNote as PrismaDealNote } from '@prisma/client'
export type DealNote = PrismaDealNote

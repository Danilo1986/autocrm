// Migration shim - re-exports from Prisma service
import type { ScriptCategory as _ScriptCategory } from '../services/quickScripts'
export { quickScriptsService } from '../services/quickScripts'
export type { ScriptCategory } from '../services/quickScripts'

// Re-export Prisma-generated types for importers that need QuickScript / CreateScriptInput
import type { QuickScript as PrismaQuickScript } from '@prisma/client'
export type QuickScript = PrismaQuickScript

export interface CreateScriptInput {
  title: string
  category: _ScriptCategory
  template: string
  icon?: string
}

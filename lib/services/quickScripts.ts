import { prisma } from '@/lib/db/prisma'

export type ScriptCategory = 'followup' | 'objection' | 'closing' | 'intro' | 'rescue' | 'other'

export const quickScriptsService = {
  async getScripts() {
    try {
      const data = await prisma.quickScript.findMany({
        orderBy: [{ isSystem: 'desc' }, { category: 'asc' }, { title: 'asc' }],
      })
      return { data, error: null }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  },

  async getScriptsByCategory(category: ScriptCategory) {
    try {
      const data = await prisma.quickScript.findMany({
        where: { category },
        orderBy: [{ isSystem: 'desc' }, { title: 'asc' }],
      })
      return { data, error: null }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  },

  async createScript(input: { title: string; category: ScriptCategory; template: string; icon?: string }, userId: string) {
    try {
      const data = await prisma.quickScript.create({
        data: {
          title: input.title,
          category: input.category,
          template: input.template,
          icon: input.icon ?? 'MessageSquare',
          isSystem: false,
          userId,
        },
      })
      return { data, error: null }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  },

  async updateScript(scriptId: string, input: Partial<{ title: string; category: ScriptCategory; template: string; icon: string }>) {
    try {
      const data = await prisma.quickScript.update({
        where: { id: scriptId, isSystem: false },
        data: input,
      })
      return { data, error: null }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  },

  async deleteScript(scriptId: string) {
    try {
      await prisma.quickScript.delete({
        where: { id: scriptId, isSystem: false },
      })
      return { error: null }
    } catch (error) {
      return { error: error as Error }
    }
  },

  getCategoryInfo(category: ScriptCategory) {
    const info: Record<ScriptCategory, { label: string; color: string }> = {
      followup: { label: 'Follow-up', color: 'blue' },
      objection: { label: 'Objecao', color: 'orange' },
      closing: { label: 'Fechamento', color: 'green' },
      intro: { label: 'Apresentacao', color: 'purple' },
      rescue: { label: 'Resgate', color: 'red' },
      other: { label: 'Outros', color: 'gray' },
    }
    return info[category] ?? info.other
  },

  applyVariables(template: string, variables: Record<string, string>) {
    let result = template
    for (const [key, value] of Object.entries(variables)) {
      result = result.replaceAll(`{${key}}`, value)
    }
    return result
  },
}

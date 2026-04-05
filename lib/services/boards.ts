import { prisma } from '@/lib/db/prisma'

// =============================================================================
// Helpers
// =============================================================================

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Find a unique key (slug) for a board within the same organization.
 * Appends -2, -3, ... on collision (max 10 attempts).
 */
async function findUniqueKey(
  baseKey: string,
  organizationId: string | null | undefined
): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = attempt === 0 ? baseKey : `${baseKey}-${attempt + 1}`
    const existing = await prisma.board.findFirst({
      where: {
        key: candidate,
        organizationId: organizationId ?? undefined,
      },
    })
    if (!existing) return candidate
  }
  // Fallback: append timestamp
  return `${baseKey}-${Date.now()}`
}

const DEFAULT_STAGES = [
  { name: 'Novo', label: 'Novo', color: 'bg-blue-500', order: 0 },
  { name: 'Em andamento', label: 'Em andamento', color: 'bg-yellow-500', order: 1 },
  { name: 'Proposta', label: 'Proposta', color: 'bg-purple-500', order: 2 },
  { name: 'Ganho', label: 'Ganho', color: 'bg-green-500', order: 3 },
  { name: 'Perdido', label: 'Perdido', color: 'bg-red-500', order: 4 },
]

// =============================================================================
// BOARDS SERVICE
// =============================================================================

export const boardsService = {
  /**
   * Fetch all boards with stages included, sorted by position ASC.
   * Filters deletedAt null (handled by Prisma extension).
   */
  async getAll(): Promise<{ data: any[] | null; error: Error | null }> {
    try {
      const boards = await prisma.board.findMany({
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        include: {
          stages: {
            orderBy: { order: 'asc' },
          },
        },
      })

      return { data: boards, error: null }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  },

  /**
   * Returns a single Board (with stages) or null.
   */
  async get(id: string): Promise<any | null> {
    try {
      if (!id) return null

      const board = await prisma.board.findUnique({
        where: { id },
        include: {
          stages: {
            orderBy: { order: 'asc' },
          },
        },
      })

      return board
    } catch (error) {
      console.error('Error fetching board:', error)
      return null
    }
  },

  /**
   * Create board with stages. Generates unique key (slug) from name.
   * Creates default stages if none provided.
   */
  async create(
    board: any,
    order?: number
  ): Promise<{ data: any | null; error: Error | null }> {
    try {
      const organizationId = board.organizationId || null

      // Determine board position
      let boardOrder = order
      if (boardOrder === undefined) {
        const lastBoard = await prisma.board.findFirst({
          orderBy: { position: 'desc' },
          select: { position: true },
        })
        boardOrder = lastBoard ? lastBoard.position + 1 : 0
      }

      // Generate unique slug
      const baseKey = generateSlug(board.key || board.name || 'board')
      const uniqueKey = await findUniqueKey(baseKey, organizationId)

      // Determine stages to create
      const stagesToCreate =
        board.stages && board.stages.length > 0
          ? board.stages.map((stage: any, index: number) => ({
              name: stage.label || stage.name,
              label: stage.label || stage.name,
              color: stage.color || 'bg-gray-500',
              order: index,
              isDefault: stage.isDefault || false,
              linkedLifecycleStage: stage.linkedLifecycleStage || null,
              organizationId,
            }))
          : DEFAULT_STAGES.map((stage) => ({
              ...stage,
              organizationId,
            }))

      const created = await prisma.board.create({
        data: {
          key: uniqueKey,
          name: board.name,
          description: board.description || null,
          type: board.type || 'SALES',
          isDefault: board.isDefault || false,
          template: board.template || null,
          linkedLifecycleStage: board.linkedLifecycleStage || null,
          nextBoardId: board.nextBoardId || null,
          goalDescription: board.goal?.description || null,
          goalKpi: board.goal?.kpi || null,
          goalTargetValue: board.goal?.targetValue || null,
          goalType: board.goal?.type || null,
          agentName: board.agentPersona?.name || null,
          agentRole: board.agentPersona?.role || null,
          agentBehavior: board.agentPersona?.behavior || null,
          entryTrigger: board.entryTrigger || null,
          automationSuggestions: board.automationSuggestions || [],
          position: boardOrder,
          ownerId: board.ownerId || null,
          organizationId,
          defaultProductId: board.defaultProductId || null,
          wonStayInStage: board.wonStayInStage || false,
          lostStayInStage: board.lostStayInStage || false,
          stages: {
            create: stagesToCreate,
          },
        },
        include: {
          stages: {
            orderBy: { order: 'asc' },
          },
        },
      })

      // Map won/lost stage IDs if provided
      if (board.wonStageId || board.lostStageId) {
        const inputStages = board.stages || []
        let realWonStageId: string | null = null
        let realLostStageId: string | null = null

        if (inputStages.length > 0 && created.stages.length === inputStages.length) {
          const wonIndex = inputStages.findIndex(
            (s: any) => s.id === board.wonStageId
          )
          if (wonIndex >= 0) realWonStageId = created.stages[wonIndex].id

          const lostIndex = inputStages.findIndex(
            (s: any) => s.id === board.lostStageId
          )
          if (lostIndex >= 0) realLostStageId = created.stages[lostIndex].id
        }

        if (realWonStageId || realLostStageId) {
          await prisma.board.update({
            where: { id: created.id },
            data: {
              wonStageId: realWonStageId,
              lostStageId: realLostStageId,
            },
          })
        }
      }

      // Re-fetch with stages to return complete data
      const result = await prisma.board.findUnique({
        where: { id: created.id },
        include: { stages: { orderBy: { order: 'asc' } } },
      })
      return { data: result ?? created, error: null }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  },

  /**
   * Update board fields. Can also update/upsert stages.
   */
  async update(id: string, updates: any): Promise<{ error: Error | null }> {
    try {
      const boardData: any = {}

      if (updates.key !== undefined)
        boardData.key = updates.key ? generateSlug(updates.key) : null
      if (updates.name !== undefined) boardData.name = updates.name
      if (updates.description !== undefined)
        boardData.description = updates.description || null
      if (updates.isDefault !== undefined) boardData.isDefault = updates.isDefault
      if (updates.template !== undefined)
        boardData.template = updates.template || null
      if (updates.linkedLifecycleStage !== undefined)
        boardData.linkedLifecycleStage = updates.linkedLifecycleStage || null
      if (updates.nextBoardId !== undefined)
        boardData.nextBoardId = updates.nextBoardId || null
      if (updates.wonStageId !== undefined)
        boardData.wonStageId = updates.wonStageId || null
      if (updates.lostStageId !== undefined)
        boardData.lostStageId = updates.lostStageId || null
      if (updates.wonStayInStage !== undefined)
        boardData.wonStayInStage = updates.wonStayInStage
      if (updates.lostStayInStage !== undefined)
        boardData.lostStayInStage = updates.lostStayInStage
      if (updates.defaultProductId !== undefined)
        boardData.defaultProductId = updates.defaultProductId || null
      if (updates.entryTrigger !== undefined)
        boardData.entryTrigger = updates.entryTrigger || null
      if (updates.automationSuggestions !== undefined)
        boardData.automationSuggestions = updates.automationSuggestions || []
      if (updates.position !== undefined) boardData.position = updates.position

      if (updates.goal !== undefined) {
        boardData.goalDescription = updates.goal?.description || null
        boardData.goalKpi = updates.goal?.kpi || null
        boardData.goalTargetValue = updates.goal?.targetValue || null
        boardData.goalType = updates.goal?.type || null
      }

      if (updates.agentPersona !== undefined) {
        boardData.agentName = updates.agentPersona?.name || null
        boardData.agentRole = updates.agentPersona?.role || null
        boardData.agentBehavior = updates.agentPersona?.behavior || null
      }

      // Update board fields
      await prisma.board.update({
        where: { id },
        data: boardData,
      })

      // Update stages if provided
      if (updates.stages) {
        const board = await prisma.board.findUnique({
          where: { id },
          select: { organizationId: true },
        })
        const organizationId = board?.organizationId || null

        await prisma.$transaction(async (tx) => {
          // Upsert provided stages
          for (const [index, stage] of updates.stages.entries()) {
            await tx.boardStage.upsert({
              where: { id: stage.id || '' },
              create: {
                boardId: id,
                name: stage.label || stage.name,
                label: stage.label || stage.name,
                color: stage.color || 'bg-gray-500',
                order: index,
                isDefault: stage.isDefault || false,
                linkedLifecycleStage: stage.linkedLifecycleStage || null,
                organizationId,
              },
              update: {
                name: stage.label || stage.name,
                label: stage.label || stage.name,
                color: stage.color || 'bg-gray-500',
                order: index,
                isDefault: stage.isDefault || false,
                linkedLifecycleStage: stage.linkedLifecycleStage || null,
              },
            })
          }

          // Delete stages that were removed
          const currentStageIds = updates.stages
            .map((s: any) => s.id)
            .filter(Boolean)

          if (currentStageIds.length > 0) {
            try {
              await tx.boardStage.deleteMany({
                where: {
                  boardId: id,
                  id: { notIn: currentStageIds },
                },
              })
            } catch (deleteError) {
              // FK constraint - stage has deals; log but don't block update
              console.warn(
                'Could not delete some removed stages (likely due to existing deals):',
                deleteError
              )
            }
          }
        })
      }

      return { error: null }
    } catch (error) {
      return { error: error as Error }
    }
  },

  /**
   * Count active deals (not deleted, not won, not lost) for board.
   */
  async canDelete(
    boardId: string
  ): Promise<{ canDelete: boolean; dealCount: number; error: Error | null }> {
    try {
      const dealCount = await prisma.deal.count({
        where: {
          boardId,
          deletedAt: null,
          isWon: false,
          isLost: false,
        },
      })

      return {
        canDelete: dealCount === 0,
        dealCount,
        error: null,
      }
    } catch (error) {
      return { canDelete: false, dealCount: 0, error: error as Error }
    }
  },

  /**
   * Move all deals from one board to another, setting stage to first stage of target.
   */
  async moveDealsToBoard(
    fromBoardId: string,
    toBoardId: string
  ): Promise<{ error: Error | null }> {
    try {
      // Get first stage of target board
      const firstStage = await prisma.boardStage.findFirst({
        where: { boardId: toBoardId },
        orderBy: { order: 'asc' },
        select: { id: true },
      })

      if (!firstStage) {
        return { error: new Error('Board de destino não tem stages') }
      }

      await prisma.deal.updateMany({
        where: { boardId: fromBoardId },
        data: {
          boardId: toBoardId,
          stageId: firstStage.id,
        },
      })

      return { error: null }
    } catch (error) {
      return { error: error as Error }
    }
  },

  /**
   * Check canDelete first. Clear next_board_id references. Then hard delete.
   */
  async delete(id: string): Promise<{ error: Error | null }> {
    try {
      const { canDelete, dealCount, error: checkError } = await this.canDelete(id)
      if (checkError) return { error: checkError }

      if (!canDelete) {
        return {
          error: new Error(
            `Não é possível excluir este board. Existem ${dealCount} negócio(s) vinculado(s). Mova ou exclua os negócios primeiro.`
          ),
        }
      }

      await prisma.$transaction(async (tx) => {
        // Clear next_board_id references pointing to this board
        await tx.board.updateMany({
          where: { nextBoardId: id },
          data: { nextBoardId: null },
        })

        // Clear user_settings.active_board_id (best-effort)
        try {
          await tx.userSettings.updateMany({
            where: { activeBoardId: id },
            data: { activeBoardId: null },
          })
        } catch {
          // best-effort: ignore errors
        }

        // Stages are deleted automatically via CASCADE
        await tx.board.delete({ where: { id } })
      })

      return { error: null }
    } catch (error) {
      return { error: error as Error }
    }
  },

  /**
   * Move deals to target, then delete board.
   */
  async deleteWithMoveDeals(
    boardId: string,
    targetBoardId: string
  ): Promise<{ error: Error | null }> {
    try {
      // 1. Move deals first
      const { error: moveError } = await this.moveDealsToBoard(
        boardId,
        targetBoardId
      )
      if (moveError) return { error: moveError }

      await prisma.$transaction(async (tx) => {
        // Clear next_board_id references
        await tx.board.updateMany({
          where: { nextBoardId: boardId },
          data: { nextBoardId: null },
        })

        // Clear user_settings.active_board_id (best-effort)
        try {
          await tx.userSettings.updateMany({
            where: { activeBoardId: boardId },
            data: { activeBoardId: null },
          })
        } catch {
          // best-effort: ignore errors
        }

        // Delete board (stages cascade)
        await tx.board.delete({ where: { id: boardId } })
      })

      return { error: null }
    } catch (error) {
      return { error: error as Error }
    }
  },

  /**
   * Create new stage with auto order (max + 1).
   */
  async addStage(
    boardId: string,
    stage: any
  ): Promise<{ data: any | null; error: Error | null }> {
    try {
      // Get current max order
      const lastStage = await prisma.boardStage.findFirst({
        where: { boardId },
        orderBy: { order: 'desc' },
        select: { order: true },
      })

      const nextOrder = lastStage ? lastStage.order + 1 : 0

      // Get board's organizationId
      const board = await prisma.board.findUnique({
        where: { id: boardId },
        select: { organizationId: true },
      })

      const created = await prisma.boardStage.create({
        data: {
          boardId,
          name: stage.label || stage.name,
          label: stage.label || stage.name,
          color: stage.color || 'bg-gray-500',
          order: nextOrder,
          isDefault: stage.isDefault || false,
          linkedLifecycleStage: stage.linkedLifecycleStage || null,
          organizationId: board?.organizationId || null,
        },
      })

      return { data: created, error: null }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  },

  /**
   * Update stage fields (label, color, etc).
   */
  async updateStage(
    stageId: string,
    updates: any
  ): Promise<{ error: Error | null }> {
    try {
      const data: any = {}

      if (updates.label !== undefined) {
        data.label = updates.label
        data.name = updates.label
      }
      if (updates.color !== undefined) data.color = updates.color
      if (updates.linkedLifecycleStage !== undefined) {
        data.linkedLifecycleStage = updates.linkedLifecycleStage || null
      }
      if (updates.order !== undefined) data.order = updates.order
      if (updates.isDefault !== undefined) data.isDefault = updates.isDefault

      await prisma.boardStage.update({
        where: { id: stageId },
        data,
      })

      return { error: null }
    } catch (error) {
      return { error: error as Error }
    }
  },

  /**
   * Check if deals exist in stage first. Error if deals found.
   */
  async deleteStage(stageId: string): Promise<{ error: Error | null }> {
    try {
      const dealCount = await prisma.deal.count({
        where: {
          stageId,
          deletedAt: null,
        },
      })

      if (dealCount > 0) {
        return {
          error: new Error(
            `Não é possível excluir este estágio. Existem ${dealCount} deal(s) nele. Mova os deals para outro estágio primeiro.`
          ),
        }
      }

      await prisma.boardStage.delete({
        where: { id: stageId },
      })

      return { error: null }
    } catch (error) {
      return { error: error as Error }
    }
  },
}

// =============================================================================
// BOARD STAGES SERVICE
// =============================================================================

export const boardStagesService = {
  /**
   * All stages sorted by order.
   */
  async getAll(): Promise<{ data: any[] | null; error: Error | null }> {
    try {
      const stages = await prisma.boardStage.findMany({
        orderBy: { order: 'asc' },
      })

      return { data: stages, error: null }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  },

  /**
   * Stages for specific board, sorted by order.
   */
  async getByBoardId(
    boardId: string
  ): Promise<{ data: any[] | null; error: Error | null }> {
    try {
      if (!boardId || boardId.trim() === '') {
        return { data: [], error: null }
      }

      const stages = await prisma.boardStage.findMany({
        where: { boardId },
        orderBy: { order: 'asc' },
      })

      return { data: stages, error: null }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  },
}

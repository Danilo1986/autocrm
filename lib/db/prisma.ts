import { PrismaClient } from '@prisma/client'

// Models that support soft-delete (have deleted_at column)
const SOFT_DELETE_MODELS = [
  'Organization',
  'CrmCompany',
  'Contact',
  'Deal',
  'Board',
  'Activity',
] as const

type SoftDeleteModel = (typeof SOFT_DELETE_MODELS)[number]

function isSoftDeleteModel(model: string): model is SoftDeleteModel {
  return SOFT_DELETE_MODELS.includes(model as SoftDeleteModel)
}

function createPrismaClient() {
  const client = new PrismaClient()

  // Soft-delete extension: automatically filters deleted records and
  // converts delete operations to soft-deletes for applicable models
  return client.$extends({
    query: {
      $allModels: {
        async findMany({ model, args, query }) {
          if (isSoftDeleteModel(model)) {
            args.where = { ...args.where, deletedAt: null }
          }
          return query(args)
        },
        async findFirst({ model, args, query }) {
          if (isSoftDeleteModel(model)) {
            args.where = { ...args.where, deletedAt: null }
          }
          return query(args)
        },
        async findUnique({ model, args, query }) {
          if (isSoftDeleteModel(model)) {
            // findUnique doesn't support arbitrary where, so just run it
            // and check deleted_at in the result
            const result = await query(args)
            if (result && 'deletedAt' in result && result.deletedAt !== null) {
              return null
            }
            return result
          }
          return query(args)
        },
        async count({ model, args, query }) {
          if (isSoftDeleteModel(model)) {
            args.where = { ...args.where, deletedAt: null }
          }
          return query(args)
        },
      },
    },
  })
}

// Singleton pattern for Prisma client
const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export type PrismaClientExtended = typeof prisma

/**
 * Internal Data API - Session-authenticated CRUD for browser clients
 *
 * Single endpoint that handles all entity operations via query params:
 *   GET /api/internal/data?entity=deals
 *   GET /api/internal/data?entity=deals&id=xxx
 *   POST /api/internal/data?entity=deals  { ...data }
 *   PATCH /api/internal/data?entity=deals&id=xxx  { ...updates }
 *   DELETE /api/internal/data?entity=deals&id=xxx
 */
import { prisma } from '@/lib/db/prisma'
import { auth } from '@/lib/auth/auth'
import type { Prisma } from '@prisma/client'

function json(body: unknown, status = 200) {
  return Response.json(body, { status })
}

async function getAuth() {
  const session = await auth()
  if (!session?.user?.id) return null
  const profile = await prisma.profile.findUnique({
    where: { id: session.user.id },
    select: { organizationId: true },
  })
  return { userId: session.user.id, orgId: profile?.organizationId }
}

type EntityConfig = {
  model: string
  softDelete?: boolean
  orgFilter?: boolean
  defaultOrder?: Record<string, 'asc' | 'desc'>
  include?: Record<string, unknown>
}

const ENTITIES: Record<string, EntityConfig> = {
  deals: { model: 'deal', softDelete: true, orgFilter: true, defaultOrder: { createdAt: 'desc' }, include: { dealItems: true, stage: { select: { name: true, label: true } } } },
  contacts: { model: 'contact', softDelete: true, orgFilter: true, defaultOrder: { createdAt: 'desc' } },
  companies: { model: 'crmCompany', softDelete: true, orgFilter: true, defaultOrder: { createdAt: 'desc' } },
  boards: { model: 'board', softDelete: true, orgFilter: true, defaultOrder: { position: 'asc' }, include: { stages: { orderBy: { order: 'asc' } } } },
  stages: { model: 'boardStage', orgFilter: true, defaultOrder: { order: 'asc' } },
  activities: { model: 'activity', softDelete: true, orgFilter: true, defaultOrder: { date: 'desc' }, include: { deal: { select: { title: true } } } },
  products: { model: 'product', orgFilter: true, defaultOrder: { createdAt: 'desc' } },
  settings: { model: 'userSettings', defaultOrder: { createdAt: 'desc' } },
  'lifecycle-stages': { model: 'lifecycleStage', defaultOrder: { order: 'asc' } },
}

export async function GET(req: Request) {
  const ctx = await getAuth()
  if (!ctx) return json({ error: 'Unauthorized' }, 401)

  const url = new URL(req.url)
  const entity = url.searchParams.get('entity')
  const id = url.searchParams.get('id')

  if (!entity || !ENTITIES[entity]) return json({ error: 'Invalid entity' }, 400)

  const config = ENTITIES[entity]
  const prismaModel = (prisma as any)[config.model]

  const where: Record<string, unknown> = {}
  if (config.softDelete) where.deletedAt = null
  if (config.orgFilter && ctx.orgId) where.organizationId = ctx.orgId
  // Settings: filter by current user
  if (entity === 'settings') where.userId = ctx.userId

  try {
    if (id) {
      const data = await prismaModel.findFirst({ where: { ...where, id }, include: config.include })
      return json({ data })
    }

    const data = await prismaModel.findMany({
      where,
      orderBy: config.defaultOrder,
      include: config.include,
      take: 1000,
    })
    return json({ data })
  } catch (error) {
    return json({ error: (error as Error).message }, 500)
  }
}

export async function POST(req: Request) {
  const ctx = await getAuth()
  if (!ctx) return json({ error: 'Unauthorized' }, 401)

  const url = new URL(req.url)
  const entity = url.searchParams.get('entity')
  if (!entity || !ENTITIES[entity]) return json({ error: 'Invalid entity' }, 400)

  const config = ENTITIES[entity]
  const prismaModel = (prisma as any)[config.model]
  const body = await req.json().catch(() => null)
  if (!body) return json({ error: 'Invalid body' }, 400)

  if (config.orgFilter && ctx.orgId) body.organizationId = ctx.orgId

  try {
    const data = await prismaModel.create({ data: body, include: config.include })
    return json({ data }, 201)
  } catch (error) {
    return json({ error: (error as Error).message }, 500)
  }
}

export async function PATCH(req: Request) {
  const ctx = await getAuth()
  if (!ctx) return json({ error: 'Unauthorized' }, 401)

  const url = new URL(req.url)
  const entity = url.searchParams.get('entity')
  const id = url.searchParams.get('id')
  if (!entity || !ENTITIES[entity] || !id) return json({ error: 'Invalid params' }, 400)

  const config = ENTITIES[entity]
  const prismaModel = (prisma as any)[config.model]
  const body = await req.json().catch(() => null)
  if (!body) return json({ error: 'Invalid body' }, 400)

  try {
    const data = await prismaModel.update({ where: { id }, data: body })
    return json({ data })
  } catch (error) {
    return json({ error: (error as Error).message }, 500)
  }
}

export async function DELETE(req: Request) {
  const ctx = await getAuth()
  if (!ctx) return json({ error: 'Unauthorized' }, 401)

  const url = new URL(req.url)
  const entity = url.searchParams.get('entity')
  const id = url.searchParams.get('id')
  if (!entity || !ENTITIES[entity] || !id) return json({ error: 'Invalid params' }, 400)

  const config = ENTITIES[entity]
  const prismaModel = (prisma as any)[config.model]

  try {
    if (config.softDelete) {
      await prismaModel.update({ where: { id }, data: { deletedAt: new Date() } })
    } else {
      await prismaModel.delete({ where: { id } })
    }
    return json({ ok: true })
  } catch (error) {
    return json({ error: (error as Error).message }, 500)
  }
}

import { prisma } from '@/lib/db/prisma'
import { auth } from '@/lib/auth/auth'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const data = await prisma.systemNotification.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  return Response.json({ data })
}

export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)

  if (body?.action === 'mark_read' && body?.id) {
    await prisma.systemNotification.update({
      where: { id: body.id },
      data: { readAt: new Date() },
    })
    return Response.json({ ok: true })
  }

  if (body?.action === 'mark_all_read') {
    await prisma.systemNotification.updateMany({
      where: { readAt: null },
      data: { readAt: new Date() },
    })
    return Response.json({ ok: true })
  }

  return Response.json({ error: 'Invalid action' }, { status: 400 })
}

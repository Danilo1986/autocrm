import { prisma } from '@/lib/db/prisma'
import { auth } from '@/lib/auth/auth'
import { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const dealId = req.nextUrl.searchParams.get('dealId')
  if (!dealId) return Response.json({ error: 'dealId is required' }, { status: 400 })

  try {
    const data = await prisma.dealNote.findMany({
      where: { dealId },
      orderBy: { createdAt: 'desc' },
    })
    return Response.json({ data, error: null })
  } catch (error) {
    return Response.json({ data: null, error: (error as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { dealId, content } = await req.json()
    if (!dealId || !content) return Response.json({ error: 'dealId and content are required' }, { status: 400 })

    const data = await prisma.dealNote.create({
      data: { dealId, content, createdBy: session.user.id },
    })
    return Response.json({ data, error: null })
  } catch (error) {
    return Response.json({ data: null, error: (error as Error).message }, { status: 500 })
  }
}

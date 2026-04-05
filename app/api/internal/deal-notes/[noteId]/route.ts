import { prisma } from '@/lib/db/prisma'
import { auth } from '@/lib/auth/auth'
import { NextRequest } from 'next/server'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ noteId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { noteId } = await params

  try {
    const { content } = await req.json()
    if (!content) return Response.json({ error: 'content is required' }, { status: 400 })

    const data = await prisma.dealNote.update({
      where: { id: noteId },
      data: { content },
    })
    return Response.json({ data, error: null })
  } catch (error) {
    return Response.json({ data: null, error: (error as Error).message }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ noteId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { noteId } = await params

  try {
    await prisma.dealNote.delete({ where: { id: noteId } })
    return Response.json({ error: null })
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}

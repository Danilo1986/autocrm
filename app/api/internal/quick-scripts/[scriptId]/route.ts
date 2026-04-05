import { prisma } from '@/lib/db/prisma'
import { auth } from '@/lib/auth/auth'
import { NextRequest } from 'next/server'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ scriptId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { scriptId } = await params

  try {
    const input = await req.json()
    const data = await prisma.quickScript.update({
      where: { id: scriptId, isSystem: false },
      data: input,
    })
    return Response.json({ data, error: null })
  } catch (error) {
    return Response.json({ data: null, error: (error as Error).message }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ scriptId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { scriptId } = await params

  try {
    await prisma.quickScript.delete({
      where: { id: scriptId, isSystem: false },
    })
    return Response.json({ error: null })
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}

import { prisma } from '@/lib/db/prisma'
import { auth } from '@/lib/auth/auth'
import { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const category = req.nextUrl.searchParams.get('category')

  try {
    const data = category
      ? await prisma.quickScript.findMany({
          where: { category },
          orderBy: [{ isSystem: 'desc' }, { title: 'asc' }],
        })
      : await prisma.quickScript.findMany({
          orderBy: [{ isSystem: 'desc' }, { category: 'asc' }, { title: 'asc' }],
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
    const { title, category, template, icon } = await req.json()
    if (!title || !category || !template) {
      return Response.json({ error: 'title, category, and template are required' }, { status: 400 })
    }

    const data = await prisma.quickScript.create({
      data: {
        title,
        category,
        template,
        icon: icon ?? 'MessageSquare',
        isSystem: false,
        userId: session.user.id,
      },
    })
    return Response.json({ data, error: null })
  } catch (error) {
    return Response.json({ data: null, error: (error as Error).message }, { status: 500 })
  }
}

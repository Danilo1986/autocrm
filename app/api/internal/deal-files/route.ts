import { prisma } from '@/lib/db/prisma'
import { auth } from '@/lib/auth/auth'
import { NextRequest } from 'next/server'
import {
  uploadFile as s3Upload,
  BUCKETS,
} from '@/lib/storage/minio'

const BUCKET = BUCKETS.DEAL_FILES

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const dealId = req.nextUrl.searchParams.get('dealId')
  if (!dealId) return Response.json({ error: 'dealId is required' }, { status: 400 })

  try {
    const data = await prisma.dealFile.findMany({
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
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const dealId = formData.get('dealId') as string | null

    if (!file || !dealId) return Response.json({ error: 'file and dealId are required' }, { status: 400 })

    // Generate unique file path
    const fileExt = file.name.split('.').pop()
    const filePath = `${dealId}/${crypto.randomUUID()}.${fileExt}`

    // Upload to MinIO
    const { error: uploadError } = await s3Upload(
      BUCKET,
      filePath,
      file,
      file.type || undefined
    )
    if (uploadError) {
      return Response.json({ data: null, error: uploadError.message }, { status: 500 })
    }

    // Create metadata record in DB
    const record = await prisma.dealFile.create({
      data: {
        dealId,
        fileName: file.name,
        filePath,
        fileSize: file.size,
        mimeType: file.type || null,
      },
    })

    return Response.json({ data: record, error: null })
  } catch (error) {
    return Response.json({ data: null, error: (error as Error).message }, { status: 500 })
  }
}

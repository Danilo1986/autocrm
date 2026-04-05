import { prisma } from '@/lib/db/prisma'
import { auth } from '@/lib/auth/auth'
import { NextRequest } from 'next/server'
import {
  deleteFile as s3Delete,
  getPresignedUrl,
  BUCKETS,
} from '@/lib/storage/minio'

const BUCKET = BUCKETS.DEAL_FILES

export async function GET(req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  await params // consume params even though we use query param for filePath

  const filePath = req.nextUrl.searchParams.get('filePath')
  if (!filePath) return Response.json({ error: 'filePath is required' }, { status: 400 })

  const result = await getPresignedUrl(BUCKET, filePath, 3600)
  if (result.error) {
    return Response.json({ url: null, error: result.error.message }, { status: 500 })
  }
  return Response.json({ url: result.url, error: null })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { fileId } = await params
  const filePath = req.nextUrl.searchParams.get('filePath')
  if (!filePath) return Response.json({ error: 'filePath is required' }, { status: 400 })

  // Delete from MinIO (best-effort)
  const { error: storageError } = await s3Delete(BUCKET, filePath)
  if (storageError) {
    console.warn('[dealFiles] Storage delete failed:', storageError.message)
  }

  // Delete metadata from DB
  try {
    await prisma.dealFile.delete({ where: { id: fileId } })
    return Response.json({ error: null })
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}

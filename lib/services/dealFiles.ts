import { prisma } from '@/lib/db/prisma'
import {
  uploadFile as s3Upload,
  deleteFile as s3Delete,
  getPresignedUrl,
  BUCKETS,
} from '@/lib/storage/minio'

export interface DealFile {
  id: string
  dealId: string
  fileName: string
  filePath: string
  fileSize: number | null
  mimeType: string | null
  createdAt: Date
  createdBy: string | null
}

const BUCKET = BUCKETS.DEAL_FILES

export const dealFilesService = {
  async getFilesForDeal(dealId: string) {
    try {
      const data = await prisma.dealFile.findMany({
        where: { dealId },
        orderBy: { createdAt: 'desc' },
      })
      return { data, error: null }
    } catch (error) {
      return { data: null as DealFile[] | null, error: error as Error }
    }
  },

  async uploadFile(dealId: string, file: File): Promise<{ data: DealFile | null; error: Error | null }> {
    try {
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
        return { data: null, error: uploadError }
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

      return { data: record as unknown as DealFile, error: null }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  },

  async getDownloadUrl(filePath: string): Promise<{ url: string | null; error: Error | null }> {
    return getPresignedUrl(BUCKET, filePath, 3600)
  },

  async deleteFile(fileId: string, filePath: string): Promise<{ error: Error | null }> {
    // Delete from MinIO (best-effort)
    const { error: storageError } = await s3Delete(BUCKET, filePath)
    if (storageError) {
      console.warn('[dealFiles] Storage delete failed:', storageError.message)
    }

    // Delete metadata from DB
    try {
      await prisma.dealFile.delete({ where: { id: fileId } })
      return { error: null }
    } catch (error) {
      return { error: error as Error }
    }
  },

  formatFileSize(bytes: number | null): string {
    if (!bytes) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    let i = 0
    let size = bytes
    while (size >= 1024 && i < units.length - 1) {
      size /= 1024
      i++
    }
    return `${size.toFixed(1)} ${units[i]}`
  },
}

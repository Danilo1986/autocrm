/**
 * MinIO / S3-Compatible Storage Client
 *
 * Replaces Supabase Storage. Uses AWS S3 SDK pointed at a MinIO endpoint.
 * Supports upload, download, delete, and presigned URL generation.
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// Configuration from environment variables
const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'http://localhost:9000'
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || 'minioadmin'
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || 'minioadmin'
const MINIO_USE_SSL = process.env.MINIO_USE_SSL === 'true'
const MINIO_REGION = process.env.MINIO_REGION || 'us-east-1'

// Bucket names
export const BUCKETS = {
  DEAL_FILES: process.env.MINIO_BUCKET_DEAL_FILES || 'deal-files',
  AVATARS: process.env.MINIO_BUCKET_AVATARS || 'avatars',
  AUDIO_NOTES: process.env.MINIO_BUCKET_AUDIO_NOTES || 'audio-notes',
} as const

// Parse endpoint URL for S3Client
function parseEndpoint() {
  const url = new URL(MINIO_ENDPOINT)
  return {
    endpoint: `${url.protocol}//${url.host}`,
    forcePathStyle: true, // Required for MinIO
  }
}

// Singleton S3 client
let _client: S3Client | null = null

function getClient(): S3Client {
  if (!_client) {
    const { endpoint, forcePathStyle } = parseEndpoint()
    _client = new S3Client({
      endpoint,
      region: MINIO_REGION,
      credentials: {
        accessKeyId: MINIO_ACCESS_KEY,
        secretAccessKey: MINIO_SECRET_KEY,
      },
      forcePathStyle,
      ...(MINIO_USE_SSL ? {} : { tls: false }),
    })
  }
  return _client
}

/**
 * Ensure a bucket exists, creating it if necessary.
 */
export async function ensureBucket(bucket: string): Promise<void> {
  const client = getClient()
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }))
  } catch {
    try {
      await client.send(new CreateBucketCommand({ Bucket: bucket }))
    } catch (createErr) {
      // Bucket might have been created by another process
      console.warn(`[storage] Could not create bucket "${bucket}":`, (createErr as Error).message)
    }
  }
}

/**
 * Upload a file to MinIO.
 */
export async function uploadFile(
  bucket: string,
  key: string,
  body: Buffer | Uint8Array | ReadableStream | Blob,
  contentType?: string
): Promise<{ key: string; error: Error | null }> {
  try {
    const client = getClient()

    // Convert Blob/File to Buffer if needed
    let uploadBody: Buffer | Uint8Array | ReadableStream
    if (body instanceof Blob) {
      const arrayBuffer = await body.arrayBuffer()
      uploadBody = Buffer.from(arrayBuffer)
    } else {
      uploadBody = body as Buffer | Uint8Array | ReadableStream
    }

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: uploadBody,
        ContentType: contentType,
      })
    )
    return { key, error: null }
  } catch (error) {
    return { key, error: error as Error }
  }
}

/**
 * Download a file from MinIO.
 */
export async function downloadFile(
  bucket: string,
  key: string
): Promise<{ data: Buffer | null; contentType: string | null; error: Error | null }> {
  try {
    const client = getClient()
    const response = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key })
    )

    const stream = response.Body
    if (!stream) {
      return { data: null, contentType: null, error: new Error('Empty response body') }
    }

    // Convert stream to buffer
    const chunks: Uint8Array[] = []
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      chunks.push(chunk)
    }
    const buffer = Buffer.concat(chunks)

    return {
      data: buffer,
      contentType: response.ContentType ?? null,
      error: null,
    }
  } catch (error) {
    return { data: null, contentType: null, error: error as Error }
  }
}

/**
 * Delete a file from MinIO.
 */
export async function deleteFile(
  bucket: string,
  key: string
): Promise<{ error: Error | null }> {
  try {
    const client = getClient()
    await client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: key })
    )
    return { error: null }
  } catch (error) {
    return { error: error as Error }
  }
}

/**
 * Generate a presigned URL for downloading a file.
 * Default expiry: 1 hour (3600 seconds).
 */
export async function getPresignedUrl(
  bucket: string,
  key: string,
  expiresIn = 3600
): Promise<{ url: string | null; error: Error | null }> {
  try {
    const client = getClient()
    const command = new GetObjectCommand({ Bucket: bucket, Key: key })
    const url = await getSignedUrl(client, command, { expiresIn })
    return { url, error: null }
  } catch (error) {
    return { url: null, error: error as Error }
  }
}

/**
 * Initialize all required buckets.
 * Call this on app startup.
 */
export async function initializeBuckets(): Promise<void> {
  for (const bucket of Object.values(BUCKETS)) {
    await ensureBucket(bucket)
  }
}

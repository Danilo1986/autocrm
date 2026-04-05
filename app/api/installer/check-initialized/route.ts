import { prisma } from '@/lib/db/prisma'

export const dynamic = 'force-dynamic'

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
    },
  })
}

export async function GET() {
  try {
    const orgCount = await prisma.organization.count()
    return json({ initialized: orgCount > 0 })
  } catch (err) {
    console.warn('[check-initialized] Exception:', err)
    return json({ initialized: false })
  }
}
